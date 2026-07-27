import React from "react";
import { StringPhoneBrand } from "../../StringPhoneApp.jsx";

export default function ChatEmptyState() {
  return (
    <div className="flex h-full min-h-[18rem] items-center justify-center">
      <StringPhoneBrand withLabel className="animate-fade-in" />
    </div>
  );
}
