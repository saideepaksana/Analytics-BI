function RelationshipMap({ relationships = [] }) {
  if (!relationships.length) {
    return (
      <div className="panel-block">
        <h3>Relationship Mapping</h3>
        <p>No relationships detected for this dataset.</p>
      </div>
    );
  }

  return (
    <div className="panel-block">
      <h3>Relationship Mapping</h3>
      <div className="table-wrap">
        <table className="basic-table">
          <thead>
            <tr>
              <th>From Collection</th>
              <th>From Column</th>
              <th>To Collection</th>
              <th>To Column</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {relationships.map((relationship, index) => (
              <tr key={`${relationship.fromCollection}-${relationship.fromColumn}-${relationship.toCollection}-${relationship.toColumn}-${index}`}>
                <td>{relationship.fromCollection || "-"}</td>
                <td>{relationship.fromColumn || "-"}</td>
                <td>{relationship.toCollection || "-"}</td>
                <td>{relationship.toColumn || "-"}</td>
                <td>
                  {typeof relationship.confidence === "number"
                    ? `${Math.round(relationship.confidence * 100)}%`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RelationshipMap;
