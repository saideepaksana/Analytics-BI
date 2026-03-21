function nextRole(currentRole) {
  const roles = ["dimension", "measure"];
  const index = roles.indexOf((currentRole || "dimension").toLowerCase());
  return roles[(index + 1) % roles.length];
}

function typeClassName(type) {
  const normalized = String(type || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function SchemaView({ schema = [], editable = false, onRoleChange }) {
  if (!schema.length) {
    return (
      <div className="panel-block">
        <h3>Schema</h3>
        <p>No schema inferred.</p>
      </div>
    );
  }

  return (
    <div className="panel-block">
      <h3>Schema</h3>
      <ul className="schema-list">
        {schema.map((column) => (
          <li key={column.name} className="schema-item">
            <div className="schema-item-main">
              <strong>{column.name}</strong>
            </div>
            <div className="schema-item-tags">
              <span className={`badge badge-type badge-type-${typeClassName(column.type)}`}>
                {column.type || "unknown"}
              </span>
              <button
                type="button"
                className={`badge badge-${column.role}`}
                onClick={() => editable && onRoleChange?.(column, nextRole(column.role))}
                disabled={!editable}
              >
                {column.role}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SchemaView;
