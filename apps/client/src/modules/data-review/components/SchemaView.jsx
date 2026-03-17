function nextRole(currentRole) {
  const roles = ["dimension", "measure"];
  const index = roles.indexOf((currentRole || "dimension").toLowerCase());
  return roles[(index + 1) % roles.length];
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
            <div>
              <strong>{column.name}</strong>
              <span className="muted"> ({column.type})</span>
            </div>
            <button
              type="button"
              className={`badge badge-${column.role}`}
              onClick={() => editable && onRoleChange?.(column, nextRole(column.role))}
              disabled={!editable}
            >
              {column.role}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SchemaView;
