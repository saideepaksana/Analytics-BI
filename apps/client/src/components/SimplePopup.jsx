import React from "react";
import { CheckCircle } from "lucide-react";

const SimplePopup = ({ message, onClose }) => {
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
             <CheckCircle size={48} color="var(--brand)" />
        </div>
        <h3>Success!</h3>
        <p>{message}</p>
        <button className="close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default SimplePopup;
