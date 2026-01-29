import { useState, useEffect } from "react";

function App() {
  const [info, setInfo] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(console.error);

    fetch("/api/info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-8">Video Library</h1>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Health Status</h2>
            {health ? (
              <div className="space-y-2">
                <p>
                  Status:{" "}
                  <span className="text-green-400">{health.status}</span>
                </p>
                <p className="text-gray-400 text-sm">{health.timestamp}</p>
              </div>
            ) : (
              <p className="text-gray-400">Loading...</p>
            )}
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">App Info</h2>
            {info ? (
              <div className="space-y-2">
                <p>
                  {info.name} v{info.version}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {info.tools.map((tool) => (
                    <span
                      key={tool}
                      className="px-2 py-1 bg-gray-700 rounded text-sm"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Loading...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
