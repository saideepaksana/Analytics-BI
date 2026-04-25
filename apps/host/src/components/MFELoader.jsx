import { Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary.jsx";

export default function MFELoader({ children }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="card mfe-loading">
            <p>Loading microfrontend...</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
