"use client";

/** Opens the browser's print dialog: print the sheet, or choose "Save as PDF". */
export function PrintButton() {
  return (
    <button type="button" className="btn btnsm" onClick={() => window.print()}>
      Print or save PDF
    </button>
  );
}
