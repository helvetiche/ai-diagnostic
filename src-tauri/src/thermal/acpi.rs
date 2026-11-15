use serde::Deserialize;
use wmi::WMIConnection;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ThermalZone {
    name: Option<String>,
    temperature: Option<u32>,
    high_precision_temperature: Option<u32>,
}

pub struct AcpiZone {
    connection: WMIConnection,
}

impl AcpiZone {
    pub fn new(connection: WMIConnection) -> Self {
        Self { connection }
    }

    /// Returns the warmest plausible ACPI zone in Celsius, plus its name.
    pub fn read(&self) -> Option<(f64, String)> {
        let zones: Vec<ThermalZone> = self
            .connection
            .raw_query(
                "SELECT Name, Temperature, HighPrecisionTemperature \
                 FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
            )
            .ok()?;

        zones
            .into_iter()
            .filter_map(|zone| {
                let raw = zone
                    .high_precision_temperature
                    .filter(|value| *value > 0)
                    .or(zone.temperature)
                    .filter(|value| *value > 0)?;
                let celsius = raw as f64 / 10.0 - 273.15;

                if !(15.0..=115.0).contains(&celsius) {
                    return None;
                }

                Some((celsius, zone.name.unwrap_or_else(|| "unnamed zone".to_string())))
            })
            .max_by(|left, right| {
                left.0
                    .partial_cmp(&right.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }
}

pub fn open_connection() -> Option<WMIConnection> {
    WMIConnection::with_namespace_path("root\\CIMV2").ok()
}
