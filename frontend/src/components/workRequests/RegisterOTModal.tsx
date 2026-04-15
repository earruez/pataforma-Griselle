import React, { useState } from "react";

interface RegisterOTModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    otNumber: string;
    receivedAt: string;
    file?: File | null;
    notes: string;
  }) => void;
}

export const RegisterOTModal: React.FC<RegisterOTModalProps> = ({
  open,
  onClose,
  onSave,
}) => {
  const [otNumber, setOtNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState({
    otNumber: false,
    receivedAt: false,
    file: false,
  });

  const errors = {
    otNumber: !otNumber.trim() ? "N° OT es requerido" : "",
    receivedAt: !receivedAt ? "La fecha es requerida" : "",
  };

  const isValid = !errors.otNumber && !errors.receivedAt;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
        <h2 className="text-xl font-bold text-slate-900 mb-4">
          Registrar OT recibida
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              N° OT <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              value={otNumber}
              onChange={(e) => setOtNumber(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, otNumber: true }))}
              required
            />
            {touched.otNumber && errors.otNumber && (
              <div className="text-xs text-rose-600 mt-1">{errors.otNumber}</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha de recepción <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              className="input w-full"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, receivedAt: true }))}
              required
            />
            {touched.receivedAt && errors.receivedAt && (
              <div className="text-xs text-rose-600 mt-1">{errors.receivedAt}</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Adjuntar respaldo (PDF, imagen o foto) <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              type="file"
              accept=".pdf,image/*"
              className="input w-full"
              onChange={(e) =>
                setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)
              }
              onBlur={() => setTouched((t) => ({ ...t, file: true }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Observaciones
            </label>
            <textarea
              className="input w-full"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            className="btn-secondary"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={!isValid}
            onClick={() => {
              setTouched({ otNumber: true, receivedAt: true, file: true });
              if (isValid) {
                onSave({
                  otNumber,
                  receivedAt,
                  file,
                  notes,
                });
              }
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
