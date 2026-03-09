import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "xterm/css/xterm.css";
import "./styles/app.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
