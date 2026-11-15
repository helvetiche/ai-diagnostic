use std::ffi::c_void;
use std::io;

use windows::core::w;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows::Win32::System::IO::DeviceIoControl;

const DEVICE_TYPE: u32 = 41394 << 16;
const IOCTL_PIO_LOAD_BINARY: u32 = DEVICE_TYPE | (0x821 << 2);
const IOCTL_PIO_EXECUTE_FN: u32 = DEVICE_TYPE | (0x841 << 2);
const FN_NAME_LENGTH: usize = 32;

/// A loaded PawnIO module. All calls stay on the thermal sampler thread.
pub struct PawnIo {
    handle: HANDLE,
}

impl PawnIo {
    pub fn load(module: &[u8]) -> io::Result<Self> {
        let handle = unsafe {
            CreateFileW(
                w!(r"\\?\GLOBALROOT\Device\PawnIO"),
                0x8000_0000 | 0x4000_0000, // GENERIC_READ | GENERIC_WRITE
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                None,
            )
        }
        .map_err(|error| io::Error::other(format!("PawnIO device unavailable: {error}")))?;

        let loaded = unsafe {
            DeviceIoControl(
                handle,
                IOCTL_PIO_LOAD_BINARY,
                Some(module.as_ptr() as *const c_void),
                module.len() as u32,
                None,
                0,
                None,
                None,
            )
        };

        if let Err(error) = loaded {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(io::Error::other(format!("PawnIO module rejected: {error}")));
        }

        Ok(Self { handle })
    }

    pub fn read_msr(&self, register: u32) -> Option<u64> {
        let output = self.execute("ioctl_read_msr", &[register as i64], 1).ok()?;
        output.first().map(|value| *value as u64)
    }

    pub fn read_smn(&self, address: u32) -> Option<u32> {
        let output = self.execute("ioctl_read_smn", &[address as i64], 1).ok()?;
        output.first().map(|value| *value as u32)
    }

    fn execute(&self, name: &str, input: &[i64], output_len: usize) -> io::Result<Vec<i64>> {
        let mut input_buffer = vec![0u8; FN_NAME_LENGTH + input.len() * 8];
        let name_bytes = name.as_bytes();
        let name_length = name_bytes.len().min(FN_NAME_LENGTH - 1);
        input_buffer[..name_length].copy_from_slice(&name_bytes[..name_length]);

        for (index, value) in input.iter().enumerate() {
            let offset = FN_NAME_LENGTH + index * 8;
            input_buffer[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
        }

        let mut output_buffer = vec![0i64; output_len];
        let mut returned = 0u32;

        unsafe {
            DeviceIoControl(
                self.handle,
                IOCTL_PIO_EXECUTE_FN,
                Some(input_buffer.as_ptr() as *const c_void),
                input_buffer.len() as u32,
                Some(output_buffer.as_mut_ptr() as *mut c_void),
                (output_len * 8) as u32,
                Some(&mut returned),
                None,
            )
        }
        .map_err(|error| io::Error::other(format!("PawnIO call {name} failed: {error}")))?;

        let count = (returned as usize / 8).min(output_len);
        output_buffer.truncate(count);
        Ok(output_buffer)
    }
}

impl Drop for PawnIo {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

pub fn installed_version() -> Option<String> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO",
            KEY_READ,
        )
        .ok()
        .and_then(|key| key.get_value::<String, _>("DisplayVersion").ok())
}

pub const INTEL_MODULE: &[u8] = include_bytes!("../../resources/pawnio/IntelMSR.bin");
pub const AMD_MODULE: &[u8] = include_bytes!("../../resources/pawnio/AMDFamily17.bin");
