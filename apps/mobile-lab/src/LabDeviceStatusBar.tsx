import React from "react";

export function LabDeviceStatusBar({
  height,
  width
}: {
  height: number;
  width: number;
}): React.JSX.Element | null {
  if (height <= 0) {
    return null;
  }

  const usesDynamicIsland = height >= 40 && width >= 390;
  return (
    <div
      aria-hidden="true"
      className={[
        "lab-device-status-bar",
        usesDynamicIsland
          ? "lab-device-status-bar--dynamic-island"
          : "lab-device-status-bar--compact"
      ].join(" ")}
      data-testid="lab-device-status-bar"
      style={{ height }}
    >
      <span className="lab-device-status-time">9:41</span>
      {usesDynamicIsland ? (
        <span className="lab-device-dynamic-island" data-testid="lab-device-dynamic-island" />
      ) : null}
      <span className="lab-device-status-indicators">
        <svg className="lab-device-cellular" viewBox="0 0 17 12">
          <rect height="3" rx="1" width="3" x="0" y="9" />
          <rect height="5" rx="1" width="3" x="4.5" y="7" />
          <rect height="8" rx="1" width="3" x="9" y="4" />
          <rect height="12" rx="1" width="3" x="13.5" y="0" />
        </svg>
        <svg className="lab-device-wifi" viewBox="0 0 18 13">
          <path d="M1 4.2C5.6.2 12.4.2 17 4.2" />
          <path d="M4 7.4c2.9-2.5 7.1-2.5 10 0" />
          <path d="M7.2 10.4c1.1-.9 2.5-.9 3.6 0" />
          <circle cx="9" cy="11.5" r="1" />
        </svg>
        <span className="lab-device-battery">
          <span className="lab-device-battery-level" />
        </span>
      </span>
    </div>
  );
}
