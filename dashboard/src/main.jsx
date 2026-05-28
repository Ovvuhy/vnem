import React from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import App from "./App.jsx";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

window.Buffer ??= Buffer;

function Providers() {
  const endpoint = "https://api.mainnet-beta.solana.com";

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

const rootElement = document.getElementById("root");
rootElement.__vnemRoot ??= createRoot(rootElement);
rootElement.__vnemRoot.render(
  <React.StrictMode>
    <Providers />
  </React.StrictMode>
);
