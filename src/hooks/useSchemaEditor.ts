// ═══ ESTADO DEL EDITOR DE ESQUEMA: BLOQUES, HISTORIAL, SELECCIÓN, ETIQUETAS ═══
// Extraído de SchemaExerciseView (F7, T7.1) sin cambio de comportamiento.
// Los handlers de arrastre (crear/mover/redimensionar bloque, asas, banda de
// repetición) siguen en el componente por ahora — leen segmentos y refs del
// DOM que aún no se han troceado — pero todos escriben a través de las
// piezas que expone este hook (setBlocksSnap/setHistory/blocksRef/etc.), así
// que el comportamiento no cambia: solo se mueve dónde vive el estado.
import { useEffect, useRef, useState } from "react";
import type { Block, Rep } from "../lib/repeats.js";
import { syncSecondPassBlocks } from "../lib/repeats.js";

export interface SchemaEditorState {
  blocks: Block[];
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
  blocksRef: React.RefObject<Block[]>;
  history: Block[][];
  setHistory: React.Dispatch<React.SetStateAction<Block[][]>>;
  selected: string | null;
  setSelected: React.Dispatch<React.SetStateAction<string | null>>;
  editId: string | null;
  setEditId: React.Dispatch<React.SetStateAction<string | null>>;
  editVal: string;
  setEditVal: React.Dispatch<React.SetStateAction<string>>;
  // Escritura con historial: registra el estado previo antes de aplicar el
  // cambio, y re-sincroniza la 2ª vez de las repeticiones si procede — mismo
  // contrato que usaban ya todos los handlers de arrastre.
  setBlocksSnap: (updater: Block[] | ((prev: Block[]) => Block[])) => void;
  undo: () => void;
  redo: () => void;
  // No toca `localReps` — el llamador (dueño de esa parte) compone su propio
  // reset añadiendo `setLocalReps([])`.
  resetBlocks: () => void;
  commitEdit: () => void;
}

export function useSchemaEditor(
  initialBlocks: Block[],
  viewMode: string,
  localReps: Rep[],
  onDraftChange?: (draft: Block[]) => void,
): SchemaEditorState {
  const [blocks,  setBlocks]  = useState<Block[]>(initialBlocks);
  // Eleva el borrador al padre (SessionShell, M4.1) en cada cambio.
  useEffect(() => { onDraftChange?.(blocks); }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const [history, setHistory] = useState<Block[][]>([]);
  // Pila de rehacer (Jon, 2026-07-18): deshacer apila aquí el presente.
  // CUALQUIER cambio de bloques ajeno a undo/redo la invalida (los estados
  // apilados ya no describen un futuro alcanzable) — ver el efecto de abajo,
  // que observa `blocks` en vez de envolver cada push de historial (los hay
  // repartidos por los handlers de arrastre, teclado y panel).
  const [redoStack, setRedoStack] = useState<Block[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  // Espejos síncronos para undo/redo (sin efectos secundarios dentro de
  // updaters de estado, que StrictMode invoca dos veces en desarrollo).
  const historyRef = useRef(history);
  historyRef.current = history;
  const redoRef = useRef(redoStack);
  redoRef.current = redoStack;
  const undoingRef = useRef(false);
  useEffect(() => {
    if (undoingRef.current) { undoingRef.current = false; return; }
    if (redoRef.current.length) { redoRef.current = []; setRedoStack([]); }
  }, [blocks]);

  const localRepsForSync = useRef(localReps);
  localRepsForSync.current = localReps;
  const viewModeForSync = useRef(viewMode);
  viewModeForSync.current = viewMode;

  const setBlocksSnap = (updater: Block[] | ((prev: Block[]) => Block[])) => {
    setHistory(p => [...p, blocksRef.current]);
    setBlocks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // En vista completa, sincronizar la 2ª vez a partir de la 1ª
      if (viewModeForSync.current === "completa" && localRepsForSync.current.length > 0) {
        return syncSecondPassBlocks(next, localRepsForSync.current);
      }
      return next;
    });
  };
  const undo = () => {
    const p = historyRef.current;
    if (!p.length) return;
    undoingRef.current = true;
    redoRef.current = [...redoRef.current, blocksRef.current];
    setRedoStack(redoRef.current);
    historyRef.current = p.slice(0, -1);
    setHistory(historyRef.current);
    setBlocks(p[p.length - 1]);
    setSelected(null); setEditId(null); setEditVal("");
  };
  const redo = () => {
    const r = redoRef.current;
    if (!r.length) return;
    undoingRef.current = true;
    historyRef.current = [...historyRef.current, blocksRef.current];
    setHistory(historyRef.current);
    redoRef.current = r.slice(0, -1);
    setRedoStack(redoRef.current);
    setBlocks(r[r.length - 1]);
    setSelected(null); setEditId(null); setEditVal("");
  };
  const resetBlocks = () => { setHistory([]); setBlocks([]); setSelected(null); setEditId(null); setEditVal(""); };

  const commitEdit = () => {
    if (!editId) return;
    setBlocks(prev => {
      const edited = prev.find(b => b.id === editId);
      return prev.map(b => {
        if (b.id === editId) return { ...b, label: editVal };
        // Propagar el nuevo label al bloque espejo de la 2ª vez
        if (edited?.pass === "first" && b.mirrorId === editId) return { ...b, label: editVal };
        return b;
      });
    });
    setEditId(null); setEditVal("");
  };

  return {
    blocks, setBlocks, blocksRef,
    history, setHistory,
    selected, setSelected,
    editId, setEditId, editVal, setEditVal,
    setBlocksSnap, undo, redo, resetBlocks, commitEdit,
  };
}
