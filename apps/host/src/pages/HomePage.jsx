/**
 * Host HomePage — re-exports the real client HomePage.
 * This file exists as a standalone page for when the host runs independently.
 * In the normal MFE flow, WorkspaceHomeRoute in App.jsx imports the client
 * HomePage directly and wires it with navigateToSection from workspace context.
 */
export { default } from "../../../client/src/modules/home/HomePage.jsx";
