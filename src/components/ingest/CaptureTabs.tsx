"use client";

import { useState } from "react";
import IngestForm from "./IngestForm";
import Recorder from "./Recorder";

const TABS = [
  { key: "paste", label: "Paste or upload" },
  { key: "record", label: "Record" },
] as const;

export default function CaptureTabs({ userName }: { userName: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("paste");

  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${
              tab === item.key
                ? "bg-neutral-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "paste" ? <IngestForm /> : <Recorder userName={userName} />}
    </div>
  );
}
