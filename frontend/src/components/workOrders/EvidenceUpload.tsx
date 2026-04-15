import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Upload, X, FileText, Image, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { workOrdersApi } from '@api/workOrders.api';

interface EvidenceUploadProps {
  workOrderId: string;
  onUploaded?: () => void;
}

export function EvidenceUpload({ workOrderId, onUploaded }: EvidenceUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => workOrdersApi.uploadEvidence(workOrderId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-order', workOrderId] });
      toast.success('Evidencia cargada exitosamente');
      setSelectedFile(null);
      onUploaded?.();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Error al cargar la evidencia');
    },
  });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  const maxSizeMb = 10;

  const validateAndSetFile = (file: File) => {
    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de archivo no permitido. Use: JPG, PNG, GIF o PDF');
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`El archivo supera el límite de ${maxSizeMb}MB`);
      return;
    }
    setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const isImage = selectedFile && selectedFile.type.startsWith('image/');
  const isPdf = selectedFile && selectedFile.type === 'application/pdf';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-medium text-amber-800">
          Se requiere evidencia fotográfica o PDF para cerrar esta OT
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : selectedFile
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {selectedFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center">
              {isImage ? (
                <Image className="w-8 h-8 text-emerald-500" />
              ) : (
                <FileText className="w-8 h-8 text-emerald-500" />
              )}
            </div>
            <p className="font-medium text-emerald-800">{selectedFile.name}</p>
            <p className="text-xs text-emerald-600">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-700">
              Arrastre o haga clic para seleccionar
            </p>
            <p className="text-xs text-slate-500">
              JPG, PNG, GIF o PDF • Máximo {maxSizeMb}MB
            </p>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
            Quitar
          </button>
          <button
            disabled={uploadMutation.isPending}
            onClick={(e) => { e.stopPropagation(); uploadMutation.mutate(selectedFile); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</>
            ) : (
              <><Upload className="w-4 h-4" /> Subir Evidencia</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface EvidenceViewerProps {
  evidenceUrl: string;
  evidenceFileName: string | null;
  evidenceUploadedAt: string | null;
  evidenceType: 'PHOTO' | 'PDF' | 'BOTH' | null;
}

export function EvidenceViewer({
  evidenceUrl,
  evidenceFileName,
  evidenceUploadedAt,
  evidenceType,
}: EvidenceViewerProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-medium text-emerald-700">Evidencia cargada</span>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          {evidenceType === 'PDF' ? (
            <FileText className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          ) : (
            <Image className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-900 truncate">
              {evidenceFileName || 'Archivo de evidencia'}
            </p>
            {evidenceUploadedAt && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Cargado el {new Date(evidenceUploadedAt).toLocaleString()}
              </p>
            )}
          </div>
          <a
            href={evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors flex-shrink-0"
          >
            Ver archivo
          </a>
        </div>
      </div>
    </div>
  );
}
