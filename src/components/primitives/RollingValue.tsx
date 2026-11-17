const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Slot-machine number roll. Each digit is a clipped window over a 0-9 strip that
 * slides to the current digit with a CSS transform transition. Non-digits render
 * as plain text. The animated glyphs are hidden from assistive tech; the real
 * string is exposed once through an sr-only copy.
 */
export function RollingValue({ value }: { value: string }) {
  return (
    <>
      <span aria-hidden="true">
        {Array.from(value).map((character, index) => {
          if (character < "0" || character > "9") {
            return <span key={index}>{character}</span>;
          }

          const digit = character.charCodeAt(0) - 48;

          return (
            <span key={index} className="rolling-digit">
              <span
                className="rolling-digit-track"
                style={{ transform: `translateY(calc(${digit} * -1lh))` }}
              >
                {DIGITS.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
