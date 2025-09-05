import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import api from "./lib/api";

function App() {
    const [user, setUser] = useState(null);
    useEffect(() => {
        api.get("/users/1")
            .then(({ data }) => setUser(data))
            .catch(console.error);
    }, []);
    return (
        <div style={{ fontFamily: "sans-serif", padding: 24 }}>
            <h1>React + FastAPI + Caddy</h1>
            <pre>{JSON.stringify(user, null, 2)}</pre>
        </div>
    );
}
createRoot(document.getElementById("root")).render(<App />);
