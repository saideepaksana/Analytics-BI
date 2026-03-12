import { Hash, Type, Calendar, ToggleLeft, List, HelpCircle } from 'lucide-react';

/**
 * SchemaView Component - Displays schema with dimension/measure badges
 * @param {Object} props
 * @param {Array} props.schema - Array of column schema { name, type, role, nullable, description }
 *   - role: 'dimension' | 'measure' | 'attribute'
 * @param {Function} props.onColumnClick - Callback when column is clicked
 * @param {Function} props.onRoleChange - Callback when role badge is clicked for editing
 */
const SchemaView = ({
  schema = [],
  onColumnClick,
  onRoleChange,
  editable = false,
  className = '',
}) => {
  // Map data types to icons
  const getTypeIcon = (type) => {
    const typeMap = {
      string: Type,
      text: Type,
      varchar: Type,
      char: Type,
      number: Hash,
      integer: Hash,
      int: Hash,
      float: Hash,
      decimal: Hash,
      double: Hash,
      date: Calendar,
      datetime: Calendar,
      timestamp: Calendar,
      boolean: ToggleLeft,
      bool: ToggleLeft,
      array: List,
      list: List,
    };
    const normalizedType = type?.toLowerCase();
    return typeMap[normalizedType] || HelpCircle;
  };

  // Get role badge class
  const getRoleBadgeClass = (role) => {
    const roleClasses = {
      dimension: 'schema-badge-dimension',
      measure: 'schema-badge-measure',
      attribute: 'schema-badge-attribute',
    };
    return roleClasses[role?.toLowerCase()] || 'schema-badge-default';
  };

  // Get role display text
  const getRoleDisplayText = (role) => {
    const roleText = {
      dimension: 'Dimension',
      measure: 'Measure',
      attribute: 'Attribute',
    };
    return roleText[role?.toLowerCase()] || 'Unknown';
  };

  const handleColumnClick = (column, index) => {
    onColumnClick?.(column, index);
  };

  const handleRoleClick = (e, column, index) => {
    e.stopPropagation();
    if (editable && onRoleChange) {
      // Cycle through roles: dimension -> measure -> attribute -> dimension
      const roles = ['dimension', 'measure', 'attribute'];
      const currentIndex = roles.indexOf(column.role?.toLowerCase());
      const nextRole = roles[(currentIndex + 1) % roles.length];
      onRoleChange(column, nextRole, index);
    }
  };

  if (!schema.length) {
    return (
      <div className={`schema-view schema-view-empty ${className}`}>
        <p>No schema available</p>
      </div>
    );
  }

  return (
    <div className={`schema-view ${className}`}>
      <div className="schema-view-header">
        <h3 className="schema-view-title">Schema</h3>
        <span className="schema-view-count">{schema.length} columns</span>
      </div>

      <div className="schema-view-list">
        {schema.map((column, index) => {
          const TypeIcon = getTypeIcon(column.type);
          
          return (
            <div
              key={column.name || index}
              className="schema-view-item"
              onClick={() => handleColumnClick(column, index)}
            >
              <div className="schema-view-item-main">
                <div className="schema-view-item-icon">
                  <TypeIcon size={16} />
                </div>
                <div className="schema-view-item-info">
                  <div className="schema-view-item-name">
                    {column.name}
                    {column.nullable === false && (
                      <span className="schema-view-required" title="Required">*</span>
                    )}
                  </div>
                  <div className="schema-view-item-type">{column.type}</div>
                </div>
              </div>

              <div className="schema-view-item-badges">
                {/* Role Badge (Dimension/Measure/Attribute) */}
                <span
                  className={`schema-badge ${getRoleBadgeClass(column.role)} ${
                    editable ? 'schema-badge-editable' : ''
                  }`}
                  onClick={(e) => handleRoleClick(e, column, index)}
                  title={editable ? 'Click to change role' : ''}
                >
                  {getRoleDisplayText(column.role)}
                </span>

                {/* Primary Key Badge */}
                {column.primaryKey && (
                  <span className="schema-badge schema-badge-pk" title="Primary Key">
                    PK
                  </span>
                )}

                {/* Foreign Key Badge */}
                {column.foreignKey && (
                  <span className="schema-badge schema-badge-fk" title="Foreign Key">
                    FK
                  </span>
                )}
              </div>

              {/* Description if available */}
              {column.description && (
                <div className="schema-view-item-description">
                  {column.description}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Schema Legend */}
      <div className="schema-view-legend">
        <div className="schema-legend-title">Legend:</div>
        <div className="schema-legend-items">
          <div className="schema-legend-item">
            <span className="schema-badge schema-badge-dimension">Dimension</span>
            <span className="schema-legend-desc">Categorical/grouping data</span>
          </div>
          <div className="schema-legend-item">
            <span className="schema-badge schema-badge-measure">Measure</span>
            <span className="schema-legend-desc">Numeric/aggregatable data</span>
          </div>
          <div className="schema-legend-item">
            <span className="schema-badge schema-badge-attribute">Attribute</span>
            <span className="schema-legend-desc">Descriptive data</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemaView;
