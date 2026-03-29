import React, { useState, useEffect } from "react";

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = document.querySelector('script[data-tmap-sdk="true"]');

    if (window.Tmapv3) {
      setReady(true);
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }

    const s = document.createElement("script");
    s.src = `https://apis.openapi.sk.com/tmap/vectorjs?version=1&appKey=${process.env.NEXT_PUBLIC_TMAP_APP_KEY || ""}`;
    s.setAttribute("data-tmap-sdk", "true");
    s.onload = () => setReady(true);

    document.head.appendChild(s);
  }, []);

  // ...rest of your component code
}

