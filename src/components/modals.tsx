// ═══ MODALES ═════════════════════════════════════════════════════════════════
// Editores y formularios modales (categorías, grupos, cursos, unidades, usuarios,
// audios, preguntas). Extraídos de App.jsx (Fase 2) sin cambiar su lógica.
import { useState, useRef } from "react";
import type { Category, Course, Unit, Group, Exercise, Question, QuestionOption } from "../lib/types.js";
import { C, S, FONT_SANS, disabledStyle } from "../theme/tokens.js";
import { uid, toggleInSet } from "../lib/ids.js";
import { fmtClock } from "../lib/time.js";
import { fetchAudioBuffer } from "../lib/audio.js";
import { modelsOf, questionScopeOf, audioDisplayTitle } from "../lib/domain.js";
import { CATEGORY_COLORS, KEY_SEQUENCE } from "../seed.js";
import { createUser, resetCredential } from "../auth/authClient.js";
import { instrumentoDe, type Instrumento } from "../lib/calificacion.js";
import { ModalShell, ErrorMsg, CredentialInput, ModalFooter, SuggestInput, TagInput } from "./primitives.jsx";
import { FragmentRangeSelector } from "./session.js";
import { InstrumentoAttach } from "./InstrumentoEditor.jsx";

// ── Tipos locales compartidos por los modales ────────────────────────────────
// Usuario (perfil) — campos consumidos por los formularios de cuenta.
interface UserLike { id: string; displayName?: string; username?: string; credType?: string; [k: string]: unknown; }
// Audio del almacén compartido. Un mismo tipo modela tanto un AUDIO suelto como
// un LIBRO (Jon, 2026-07-06): colección que agrupa varios audios —un movimiento
// de una sinfonía, un preludio de un ciclo, un aria de una ópera… Un libro lleva
// `kind:"book"` y NO tiene url/duration; un audio suelto no lleva `kind`, y si
// pertenece a un libro lleva `bookId` con el id de ese libro. Ambos viven en la
// misma tabla `fa_audio_library` (sin nueva tabla ni migración).
export interface AudioItem { id: string; kind?: "book"; bookId?: string; title?: string; composer?: string; description?: string; tags?: string[]; url?: string; duration?: number | null; createdAt?: number; [k: string]: unknown; }
// Botón editable dentro del editor de categoría.
interface EditButton { id: string; name: string; color: string; key: string; }

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext; }
}

// Editor de categoría (nuevo o existente)
export function CategoryEditorModal({ initialCategory, onSave, onClose }: { initialCategory?: Category | null; onSave: (category: Category) => void; onClose: () => void }) {
  const isNew = !initialCategory;
  const [name,    setName]    = useState(initialCategory?.name || "");
  const [hasFigures, setHasFigures] = useState(initialCategory?.hasFigures ?? false);
  const [buttons, setButtons] = useState<EditButton[]>((initialCategory?.buttons as EditButton[] | undefined) || [
    { id: "A", name: "Botón A", color: CATEGORY_COLORS[0], key: KEY_SEQUENCE[0] },
    { id: "B", name: "Botón B", color: CATEGORY_COLORS[1], key: KEY_SEQUENCE[1] },
  ]);
  const maxBtns = hasFigures ? 8 : 6;

  const updateBtn = (i: number, patch: Partial<EditButton>) => setButtons((prev) => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const addBtn = () => {
    if (buttons.length >= maxBtns) return;
    const i = buttons.length;
    setButtons((prev) => [...prev, {
      id: String.fromCharCode(65 + i),
      name: `Botón ${String.fromCharCode(65 + i)}`,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      key:   KEY_SEQUENCE[i % KEY_SEQUENCE.length],
    }]);
  };
  const removeBtn = (i: number) => { if (buttons.length > 2) setButtons((prev) => prev.filter((_, idx) => idx !== i)); };

  const canSave = Boolean(name.trim() && buttons.length >= 2 && buttons.every((b) => b.id.trim() && b.name.trim() && b.key.trim().length === 1));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:      initialCategory?.id || uid("cat"),
      name:    name.trim(),
      builtIn: initialCategory?.builtIn ?? false,
      global:  initialCategory?.global  ?? false,
      hasFigures,
      buttons: buttons.map((b) => ({ ...b, id: b.id.trim().toUpperCase(), name: b.name.trim(), key: b.key.trim().toLowerCase() })),
    });
  };

  return (
    <ModalShell width={520} align="top" onClose={onClose} label="Categoría">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {isNew ? "Nueva categoría" : "Editar categoría"}
      </h3>

      <label style={S.label}>Nombre de la categoría</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name}
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Cadencias" autoFocus />

      <label className="fa-pressable" style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", marginBottom: 18, padding: "9px 11px", borderRadius: 8, border: `1px solid ${hasFigures ? C.ink : C.line}`, background: hasFigures ? `${C.ink}08` : C.paper2 }}>
        <input type="checkbox" checked={hasFigures} onChange={(e) => setHasFigures(e.target.checked)} style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.ink }}>Grados con cifrado / inversiones</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>
            Los botones son grados (I, II, V…) y el alumno puede asignar el cifrado de bajo (6, ⁶₄, 7, ⁶₅…) a cada fragmento al seleccionarlo.
          </span>
        </span>
      </label>

      <label style={S.label}>{hasFigures ? "Grados" : "Botones"} ({buttons.length}/{maxBtns})</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {buttons.map((b, i) => (
          <div key={i} style={{ ...S.row, gap: 8, background: C.paper2, padding: "8px 10px", borderRadius: 8 }}>
            <input type="color" value={b.color} onChange={(e) => updateBtn(i, { color: e.target.value })}
              style={{ width: 36, height: 32, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", padding: 0, background: "transparent", flexShrink: 0 }} />
            <input value={b.id} onChange={(e) => updateBtn(i, { id: e.target.value.slice(0, 4) })}
              style={{ ...S.input, width: 50, fontFamily: FONT_SANS, fontWeight: 700, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={4} placeholder="ID" />
            <input value={b.name} onChange={(e) => updateBtn(i, { name: e.target.value })}
              style={{ ...S.input, flex: 1, padding: "6px 10px", minWidth: 0 }} placeholder="Nombre" />
            <input value={b.key} onChange={(e) => updateBtn(i, { key: e.target.value.slice(0, 1) })}
              style={{ ...S.input, width: 36, fontFamily: FONT_SANS, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={1} placeholder="t" />
            <button onClick={() => removeBtn(i)} disabled={buttons.length <= 2} className="fa-hit40"
              style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11, ...disabledStyle(buttons.length > 2), flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>

      <button onClick={addBtn} disabled={buttons.length >= maxBtns}
        style={{ ...S.btn, width: "100%", marginBottom: 18, ...disabledStyle(buttons.length < maxBtns) }}>
        + Añadir {hasFigures ? "grado" : "botón"}
      </button>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={isNew ? "Crear" : "Guardar"} />
    </ModalShell>
  );
}

// Formulario de curso
export function GroupEditorModal({ initial, students, currentUserId, onSave, onClose }: { initial?: Group | null; students: UserLike[]; currentUserId: string; onSave: (group: Group) => void; onClose: () => void }) {
  const [name,       setName]       = useState(initial?.name || "");
  const [studentIds, setStudentIds] = useState<Set<string>>(() => new Set(initial?.studentIds || []));

  const toggleStudent = (id: string) => setStudentIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("group"),
      name:       name.trim(),
      teacherId:  currentUserId,
      studentIds: [...studentIds],
      createdAt:  initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top" onClose={onClose} label="Grupo">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {initial ? "Editar grupo" : "Nuevo grupo"}
      </h3>

      <label style={S.label}>Nombre del grupo</label>
      <input style={{ ...S.input, marginBottom: 18 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Grupo A, 2º Bachillerato…" />

      {students.length > 0 && (
        <>
          <label style={{ ...S.label, marginBottom: 8 }}>Alumnos del grupo</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, maxHeight: 240, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px" }}>
            {students.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: FONT_SANS, fontSize: 13, color: C.ink }}>
                <input type="checkbox" checked={studentIds.has(s.id)} onChange={() => toggleStudent(s.id)}
                  style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer" }} />
                <span style={{ flex: 1 }}>{s.displayName}</span>
                <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_SANS }}>@{s.username}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear grupo"} />
    </ModalShell>
  );
}

export function CourseFormModal({ initial, groups = [], onSave, onClose }: { initial?: Course | null; groups?: Group[]; onSave: (course: Course) => void; onClose: () => void }) {
  const [name,              setName]              = useState(initial?.name || "");
  const [desc,              setDesc]              = useState(initial?.description || "");
  const [visibility,        setVisibility]        = useState(initial?.visibility || "teacher");
  const [visibilityGroupId, setVisibilityGroupId] = useState(initial?.visibilityGroupId || "");

  const canSave = name.trim().length > 0 && (visibility !== "group" || visibilityGroupId !== "");

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:                initial?.id || uid("course"),
      name:              name.trim(),
      description:       desc.trim(),
      unitIds:           initial?.unitIds || [],
      visibility,
      visibilityGroupId: visibility === "group" ? visibilityGroupId : null,
      createdAt:         initial?.createdAt || Date.now(),
    });
  };

  const VIS_OPTIONS = [
    { id: "teacher", label: "Mis alumnos",      desc: "Solo los alumnos asignados a ti" },
    { id: "public",  label: "Público",           desc: "Todos los alumnos de la aplicación" },
    { id: "group",   label: "Grupo específico",  desc: "Solo los alumnos de un grupo" },
  ];

  return (
    <ModalShell width={480} onClose={onClose} label={initial ? "Editar curso" : "Nuevo curso"}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar curso" : "Nuevo curso"}</h3>

      <label style={S.label}>Nombre del curso</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: 2º Bachillerato — Armonía" />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Breve descripción del curso…" />

      <label style={{ ...S.label, marginBottom: 8 }}>Visibilidad</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: visibility === "group" ? 10 : 20 }}>
        {VIS_OPTIONS.map((opt) => (
          <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${visibility === opt.id ? C.ink : C.line}`, background: visibility === opt.id ? C.paper2 : "transparent", fontFamily: FONT_SANS }}>
            <input type="radio" name="visibility" value={opt.id} checked={visibility === opt.id} onChange={() => setVisibility(opt.id)}
              style={{ accentColor: C.ink, width: 15, height: 15, cursor: "pointer", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {visibility === "group" && (
        <div style={{ marginBottom: 18 }}>
          {groups.length === 0
            ? <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Aún no tienes grupos. Créalos desde la pestaña Alumnos.</p>
            : <select value={visibilityGroupId} onChange={(e) => setVisibilityGroupId(e.target.value)}
                style={{ ...S.input, cursor: "pointer" }}>
                <option value="">— Selecciona un grupo —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
          }
        </div>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}

// Formulario de unidad
export function UnitFormModal({ initial, onSave, onClose }: { initial?: Unit | null; onSave: (unit: Unit) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("unit"),
      name:        name.trim(),
      description: desc.trim(),
      exerciseIds: initial?.exerciseIds || [],
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={440} onClose={onClose} label="Unidad didáctica">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar unidad" : "Nueva unidad didáctica"}</h3>
      <label style={S.label}>Nombre de la unidad</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} placeholder="Ej: Tema 3 — Cadencias" />
      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Objetivos y contenido…" />
      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}

// Picker de ejercicios del banco (para asignar a una unidad)
export function ExercisePickerModal({ exercises, alreadyInUnit, onAdd, onClose }: { exercises: Exercise[]; alreadyInUnit: string[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inUnit    = new Set(alreadyInUnit.map(String));   // ids pueden venir numéricos (dato antiguo)
  const available = exercises.filter((e) => !inUnit.has(String(e.id)));
  const toggle    = (id: string) => setSelected((s) => toggleInSet(s, id) as Set<string>);

  return (
    <ModalShell width={520} align="top" onClose={onClose} label="Añadir ejercicios">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>Añadir ejercicios desde el banco</h3>

      {available.length === 0 ? (
        <p style={{ color: C.muted, textAlign: "center", padding: "1.5rem 0", fontSize: 13 }}>
          {exercises.length === 0
            ? "Aún no hay ejercicios en el banco. Crea uno desde la pestaña Ejercicios."
            : "Todos los ejercicios del banco ya están en esta unidad."}
        </p>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {available.map((ex) => {
            const exId = String(ex.id);
            const isSel = selected.has(exId);
            return (
              <label key={exId}
                style={{ ...S.row, gap: 10, padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: isSel ? "rgba(26,25,21,0.04)" : "transparent" }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(exId)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{ex.title}</div>
                  <div style={{ ...S.row, gap: 6 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(ex.duration ?? 0)}</span>
                    {(() => {
                      const isQuiz = modelsOf(ex)[0] === "cuestionario";
                      return <span style={{ ...S.badge, background: isQuiz ? "rgba(47,111,184,0.10)" : "rgba(63,155,91,0.08)", color: isQuiz ? C.quiz : C.fnT }}>{isQuiz ? "Cuestionario" : "Interactivo"}</span>;
                    })()}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <ModalFooter onCancel={onClose} onSave={() => onAdd([...selected])} canSave={selected.size > 0}
        saveLabel={<>Añadir {selected.size > 0 && `(${selected.size})`}</>} />
    </ModalShell>
  );
}

// Crear un alumno o profesor con credencial PIN o contraseña
export function AddUserModal({ forRole, currentUserId, existingUsernames, onSave, onClose }: { forRole: string; currentUserId: string; existingUsernames: string[]; onSave: (profile: unknown) => void; onClose: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("");
  const [credType,    setCredType]    = useState(forRole === "student" ? "pin" : "password");
  const [credValue,   setCredValue]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const taken   = username.trim() && existingUsernames.includes(username.trim().toLowerCase());
  const canSave = Boolean(displayName.trim() && username.trim() && credValue.length >= minLen && !taken && !loading);

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      // El usuario se crea en el SERVIDOR (hash PBKDF2 allí; perfil a fa_users,
      // secreto a fa_user_secrets). El servidor verifica la autorización del que
      // llama (profesor solo crea alumnos asignados a sí mismo).
      const profile = await createUser({
        username:    username.trim().toLowerCase(),
        credential:  credValue,
        role:        forRole,
        displayName: displayName.trim(),
        credType,
        ...(forRole === "student" ? { teacherId: currentUserId } : {}),
      });
      onSave(profile);
    } catch (e) { setError((e as Error).message || "Error al crear la cuenta."); }
    finally  { setLoading(false); }
  };

  const roleLabel = forRole === "teacher" ? "profesor" : "alumno";

  return (
    <ModalShell width={420} onClose={onClose} label="Crear cuenta">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>Crear cuenta de {roleLabel}</h3>

      <label style={S.label}>Nombre visible</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={displayName} autoFocus
        onChange={(e) => setDisplayName(e.target.value)} placeholder={`Ej: ${forRole === "teacher" ? "Prof. García" : "Juan García"}`} />

      <label style={S.label}>Nombre de usuario</label>
      <input style={{ ...S.input, marginBottom: taken ? 4 : 14, borderColor: taken ? C.danger : undefined }}
        autoComplete="off"
        value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
        placeholder="usuario.unico" />
      {taken && <ErrorMsg style={{ marginBottom: 14 }}>Este nombre de usuario ya existe</ErrorMsg>}

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN (4-6 dígitos)" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>{isPin ? "PIN inicial" : "Contraseña inicial"} (mín. {minLen} caracteres)</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={loading ? "Creando…" : "Crear cuenta"} />
    </ModalShell>
  );
}

// Resetear PIN/contraseña de un usuario existente
export function ResetCredentialModal({ targetUser, onSave, onClose }: { targetUser: UserLike; onSave: (profile: unknown) => void; onClose: () => void }) {
  const [credType,  setCredType]  = useState(targetUser.credType || "pin");
  const [credValue, setCredValue] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const canSave = credValue.length >= minLen && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      // El restablecimiento ocurre en el SERVIDOR (hash + actualización de
      // fa_user_secrets); el cliente no escribe secretos.
      const profile = await resetCredential({ userId: targetUser.id, credential: credValue, credType });
      onSave(profile);
    } catch (e) { setError((e as Error).message || "Error al actualizar la credencial."); }
    finally  { setLoading(false); }
  };

  return (
    <ModalShell width={420} onClose={onClose} label="Resetear acceso">
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: C.ink }}>Resetear acceso</h3>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 18px" }}>
        Usuario: <strong style={{ color: C.ink }}>{targetUser.displayName}</strong>
      </p>

      <label style={S.label}>Tipo de credencial</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "pin", label: "PIN" }, { id: "password", label: "Contraseña" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => { setCredType(opt.id); setCredValue(""); }}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: credType === opt.id ? C.ink   : C.paper,
              color:      credType === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${credType === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Nuevo {isPin ? "PIN" : "contraseña"} (mín. {minLen})</label>
      <CredentialInput
        kind={isPin ? "pin" : "password"}
        value={credValue}
        onChange={setCredValue}
        autoFocus
        marginBottom={22}
        onSubmit={handleSave}
      />

      <ErrorMsg style={{ marginTop: -14, marginBottom: 14 }}>{error}</ErrorMsg>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={loading ? "Actualizando…" : "Resetear"} />
    </ModalShell>
  );
}

// Picker para elegir un audio del almacén
export function AudioLibraryPickerModal({ library, onPick, onClose }: { library: AudioItem[]; onPick: (audio: AudioItem) => void; onClose: () => void }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Los libros no son audios elegibles (no tienen url/duración): se ocultan aquí
  // para no colarse como opción al asignar audio a un ejercicio.
  const audios = library.filter((a) => a.kind !== "book");
  return (
    <ModalShell width={560} align="top" onClose={onClose} label="Elegir audio">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Elegir audio del almacén</h3>

      {audios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          
          <div>El almacén está vacío.</div>
          <div style={{ fontSize: 12 }}>Pide al administrador que añada audios.</div>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {audios.map((audio) => {
            const isPrev = previewId === audio.id;
            return (
              <div key={audio.id} style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 4, background: isPrev ? "rgba(26,25,21,0.04)" : "transparent", transition: "background .1s" }}>
                <div style={{ ...S.row, gap: 10, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Título compuesto «pieza ~ libro» (Jon, 2026-07-12): en esta
                        lista plana el audio aparece solo, sin su libro a la vista. */}
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, marginBottom: audio.composer ? 1 : (audio.description ? 2 : 4), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audioDisplayTitle(audio, library)}</div>
                    {audio.composer && <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginBottom: audio.description ? 2 : 4 }}>{audio.composer}</div>}
                    {audio.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.description}</div>}
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_SANS, fontVariantNumeric: "tabular-nums" }}>{fmtClock(audio.duration ?? 0)}</span>
                  </div>
                  <div style={{ ...S.row, gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setPreviewId(isPrev ? null : audio.id)} style={{ ...S.btn, padding: "5px 9px", fontSize: 11 }}>
                      {isPrev ? "⏹" : "▶"}
                    </button>
                    <button onClick={() => onPick(audio)} style={{ ...S.btnPrimary, padding: "5px 11px", fontSize: 12 }}>Elegir</button>
                  </div>
                </div>
                {isPrev && (
                  <audio src={audio.url} controls autoPlay style={{ width: "100%", marginTop: 8, height: 34 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.btn}>Cancelar</button>
      </div>
    </ModalShell>
  );
}

// Crear/editar un audio en el almacén
export function AudioLibraryFormModal({ initial, books = [], initialBookId = null, allTags = [], allComposers = [], onSave, onClose }: { initial?: AudioItem | null; books?: AudioItem[]; initialBookId?: string | null; allTags?: string[]; allComposers?: string[]; onSave: (audio: AudioItem, newBook?: AudioItem) => void; onClose: () => void }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [composer,    setComposer]    = useState(initial?.composer || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags,        setTags]        = useState<string[]>(initial?.tags || []);
  const [url,         setUrl]         = useState(initial?.url || "");
  const [duration,    setDuration]    = useState<number | null>(initial?.duration || null);
  const [detecting,   setDetecting]   = useState(false);
  const [error,       setError]       = useState("");
  // Libro al que pertenece (Jon, 2026-07-06): "" = suelto; un id = ese libro;
  // "__new__" = crear un libro nuevo con el título de abajo. Al añadir desde
  // dentro de un libro se preselecciona con initialBookId.
  const [bookSel,      setBookSel]      = useState<string>(initial?.bookId ?? initialBookId ?? "");
  const [newBookTitle, setNewBookTitle] = useState("");

  // BUG FIX: cancelación de detecciones obsoletas también aquí
  const urlReqRef = useRef(0);
  const handleUrlChange = (newUrl: string) => {
    const trimmed = newUrl.trim();
    setUrl(trimmed);
    setError("");
    if (!trimmed) { setDuration(null); urlReqRef.current++; return; }

    setDetecting(true);
    const reqId    = ++urlReqRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { setDetecting(false); return; }
    const ctx = new AudioCtx();
    fetchAudioBuffer(trimmed)
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        ctx.close();
        if (reqId !== urlReqRef.current) return;
        setDuration(Math.ceil(decoded.duration));
        setDetecting(false);
      })
      .catch(() => {
        try { ctx.close(); } catch {}
        if (reqId !== urlReqRef.current) return;
        setError("No se pudo verificar la URL del audio.");
        setDetecting(false);
      });
  };

  const creatingBook = bookSel === "__new__";
  const canSave = Boolean(title.trim() && url.trim() && duration && !detecting && (!creatingBook || newBookTitle.trim()));

  const handleSave = () => {
    if (!canSave) return;
    // Libro nuevo: se crea aquí (hereda el compositor del audio) y el audio
    // queda enlazado a él. Se devuelve como segundo argumento para que el
    // contenedor lo persista antes que el audio.
    let newBook: AudioItem | undefined;
    let bookId: string | undefined;
    if (creatingBook) {
      newBook = { id: uid("book"), kind: "book", title: newBookTitle.trim(), composer: composer.trim(), createdAt: Date.now() };
      bookId = newBook.id;
    } else if (bookSel) {
      bookId = bookSel;
    }
    onSave({
      id:          initial?.id || uid("audio"),
      title:       title.trim(),
      composer:    composer.trim(),
      description: description.trim(),
      tags,
      url:         url.trim(),
      duration,
      bookId,
      createdAt:   initial?.createdAt || Date.now(),
    }, newBook);
  };

  return (
    <ModalShell width={480} align="top" onClose={onClose} label="Audio">
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar audio" : "Añadir audio al almacén"}</h3>

      <label style={S.label}>Título</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={title} autoFocus
        onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Coral nº 4 — Bach (BWV 28)" />

      <label style={S.label}>Compositor</label>
      <SuggestInput
        value={composer}
        onChange={setComposer}
        suggestions={allComposers}
        placeholder="Ej: Johann Sebastian Bach"
        style={{ ...S.input, marginBottom: 14 }}
      />

      {/* Libro (opcional): dejar suelto, unir a un libro existente o crear uno
          nuevo aquí mismo — el libro nuevo hereda el compositor de arriba. */}
      <label style={S.label}>Libro <span style={{ fontWeight: 400, color: C.muted }}>(opcional)</span></label>
      <select value={bookSel} onChange={(e) => setBookSel(e.target.value)}
        style={{ ...S.input, marginBottom: creatingBook ? 8 : 14, appearance: "auto", cursor: "pointer" }}>
        <option value="">Ninguno · audio suelto</option>
        {books.length > 0 && (
          <optgroup label="Añadir a un libro existente">
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}{b.composer ? ` — ${b.composer}` : ""}</option>)}
          </optgroup>
        )}
        <option value="__new__">＋ Crear un libro nuevo…</option>
      </select>
      {creatingBook && (
        <input style={{ ...S.input, marginBottom: 14 }} value={newBookTitle}
          onChange={(e) => setNewBookTitle(e.target.value)} placeholder="Título del libro nuevo · Ej: Preludios, op. 28" />
      )}

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tonalidad, contexto histórico…" />

      <label style={{ ...S.label, marginBottom: 4 }}>Etiquetas internas <span style={{ fontWeight: 400, color: C.muted }}>(solo visibles para el profesor)</span></label>
      <div style={{ marginBottom: 14 }}>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Pulsa Intro o coma para añadir · Ej: "Forma sonata", "Modulación cromática"</div>
      </div>

      <label style={S.label}>URL del audio</label>
      <input type="url" style={{ ...S.input, marginBottom: 6 }}
        value={url} onChange={(e) => handleUrlChange(e.target.value)} placeholder="https://res.cloudinary.com/…" />
      {detecting && <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Verificando audio…</p>}
      {duration && !detecting && <p style={{ fontSize: 12, color: C.fnT, margin: "0 0 14px" }}>✓ Duración detectada: {fmtClock(duration ?? 0)}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      <div style={{ marginBottom: 8 }} />

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Añadir"} />
    </ModalShell>
  );
}

// Crear/editar un LIBRO del almacén (Jon, 2026-07-06): colección de audios. Sin
// url/duración — solo metadatos (título, compositor, etiquetas, descripción).
// Los audios se insertan después, desde el propio audio o desde el libro.
// Sin etiquetas (Jon, 2026-07-06: como siempre, sin metadatos ni emoticonos) —
// un libro es solo título + compositor + descripción; las etiquetas quedan
// donde aportan (los audios sueltos), no repetidas también aquí.
export function BookFormModal({ initial, allComposers = [], onSave, onClose }: { initial?: AudioItem | null; allComposers?: string[]; onSave: (book: AudioItem) => void; onClose: () => void }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [composer,    setComposer]    = useState(initial?.composer || "");
  const [description, setDescription] = useState(initial?.description || "");

  const canSave = Boolean(title.trim());
  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("book"),
      kind:        "book",
      title:       title.trim(),
      composer:    composer.trim(),
      description: description.trim(),
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top" onClose={onClose} label="Libro">
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar libro" : "Añadir libro al almacén"}</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>Un libro agrupa varios audios (los movimientos de una sinfonía, los preludios de un ciclo, las arias de una ópera…). Los audios se añaden después.</p>

      <label style={S.label}>Título</label>
      <input style={{ ...S.input, marginBottom: 14 }} value={title} autoFocus
        onChange={(e) => setTitle(e.target.value)} placeholder="Ej: El clave bien temperado, Libro I" />

      <label style={S.label}>Compositor</label>
      <SuggestInput
        value={composer}
        onChange={setComposer}
        suggestions={allComposers}
        placeholder="Ej: Johann Sebastian Bach"
        style={{ ...S.input, marginBottom: 14 }}
      />

      <label style={S.label}>Descripción (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 18, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto de la colección…" />

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Añadir"} />
    </ModalShell>
  );
}

// Editor de pregunta (test o desarrollo)
export function QuestionEditorModal({ initial, defaultStart, audioDuration, audioUrl = null, onSave, onClose, plantillasInstrumento, onChangePlantillasInstrumento }: {
  initial?: Question | null; defaultStart?: number; audioDuration: number; audioUrl?: string | null;
  onSave: (q: Question) => void; onClose: () => void;
  // N3.3: biblioteca de plantillas del profesor para el instrumento de desarrollo.
  plantillasInstrumento?: Instrumento[]; onChangePlantillasInstrumento?: (next: Instrumento[]) => void;
}) {
  const [text,            setText]            = useState(initial?.text || "");
  const [type,            setType]            = useState(initial?.type || "test");
  // N3.3: instrumento de corrección de una pregunta de desarrollo — copia
  // inline en q.evaluacion.instrumento (instantánea, nunca referencia).
  const [instrumento,     setInstrumento]     = useState<Instrumento | undefined>(instrumentoDe(initial));
  const [scope,           setScope]           = useState<"fragmento" | "obra">(initial ? questionScopeOf(initial) : "fragmento");
  const [explanation,     setExplanation]     = useState(initial?.explanation || "");
  const [audioStart,      setAudioStart]      = useState<number>(initial?.audioStart ?? defaultStart ?? 0);
  const [audioEnd,        setAudioEnd]        = useState<number>(initial?.audioEnd   ?? Math.min(audioDuration, (defaultStart ?? 0) + 10));
  const [options,         setOptions]         = useState<QuestionOption[]>(initial?.options || [
    { id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState(initial?.correctOptionId || "A");
  const [points,          setPoints]          = useState<number>(initial?.points ?? 1);
  const [acceptedText,    setAcceptedText]    = useState((initial?.accepted || []).join("\n"));
  const accepted = acceptedText.split("\n").map((s) => s.trim()).filter(Boolean);

  const updateOpt = (i: number, txt: string) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, text: txt } : o));
  const addOpt = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, { id: String.fromCharCode(65 + prev.length), text: "" }]);
  };
  const removeOpt = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, id: String.fromCharCode(65 + idx) }));
      if (correctOptionId && !next.some((o) => o.id === correctOptionId)) setCorrectOptionId(next[0].id);
      return next;
    });
  };

  const canSave = Boolean(
    text.trim() &&
    // Las de obra no acotan tramo: se saltan la validación de tiempos (M6).
    (scope === "obra" || audioEnd > audioStart) &&
    (type !== "test" || (options.every((o) => (o.text ?? "").trim()) && correctOptionId)) &&
    (type !== "corta" || accepted.length > 0));

  const handleSave = () => {
    if (!canSave) return;
    const isObra = scope === "obra";
    onSave({
      id:         initial?.id || uid("q"),
      text:       text.trim(),
      type,
      scope,
      // Obra ⇒ sin tiempos (evita rangos degenerados «0:00–fin»); fragmento ⇒ tramo.
      audioStart: isObra ? undefined : audioStart,
      audioEnd:   isObra ? undefined : audioEnd,
      options:    type === "test" ? options.map((o) => ({ ...o, text: (o.text ?? "").trim() })) : [],
      correctOptionId: type === "test" ? correctOptionId : null,
      explanation: explanation.trim() || undefined,
      points:     type === "test" || type === "corta" ? points : undefined,
      accepted:   type === "corta" ? accepted : undefined,
      // El instrumento solo tiene sentido en desarrollo (test/corta se
      // autocorrigen); si se cambió el tipo después de adjuntarlo, se retira.
      evaluacion: type === "desarrollo" && instrumento ? { instrumento } : undefined,
    });
  };

  return (
    <ModalShell width={560} align="top" onClose={onClose} label="Pregunta">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar pregunta" : "Nueva pregunta"}</h3>

      <label style={S.label}>Tipo</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "test", label: "Tipo test" }, { id: "corta", label: "Respuesta corta" }, { id: "desarrollo", label: "Desarrollo" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => setType(opt.id)}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: type === opt.id ? C.ink   : C.paper,
              color:      type === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${type === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Pregunta</label>
      <textarea style={{ ...S.input, marginBottom: 14, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="¿Qué función armónica predomina en este fragmento?" autoFocus />

      {/* Ámbito (M6): fragmento acota un tramo; obra atañe al audio entero. */}
      <label style={S.label}>Ámbito</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "fragmento", label: "Fragmento" }, { id: "obra", label: "Obra completa" }].map((opt) => (
          <button key={opt.id} type="button" onClick={() => setScope(opt.id as "fragmento" | "obra")}
            style={{
              ...S.btn, flex: 1, fontSize: 12,
              background: scope === opt.id ? C.ink   : C.paper,
              color:      scope === opt.id ? C.paper : C.ink2,
              border:     `1px solid ${scope === opt.id ? C.ink : C.line}`,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {scope === "fragmento" ? (
        <>
          <label style={S.label}>Fragmento de audio</label>
          <div style={{ marginBottom: 14 }}>
            <FragmentRangeSelector
              totalDuration={audioDuration}
              start={audioStart}
              end={audioEnd}
              onChange={({ start, end }) => { setAudioStart(start); setAudioEnd(end); }}
              onClear={() => { setAudioStart(0); setAudioEnd(audioDuration); }}
              onDefine={() => {}}
              audioUrl={audioUrl}
            />
            {!audioUrl && (
              <p style={{ fontSize: 11, color: C.muted, margin: "-4px 0 0", lineHeight: 1.5 }}>
                Este ejercicio aún no tiene audio — arrastra los bordes para fijar el fragmento; podrás escucharlo en cuanto lo subas.
              </p>
            )}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 14px", padding: "8px 10px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8, lineHeight: 1.5 }}>
          Pregunta sobre la obra completa: el alumno la escucha entera, sin tramo acotado.
        </p>
      )}

      {(type === "test" || type === "corta") && (
        <>
          <label style={S.label}>Peso en la nota</label>
          <div style={{ ...S.row, gap: 8, alignItems: "center", marginBottom: 14 }}>
            <input type="number" min={1} max={20} step={1} style={{ ...S.input, width: 80 }}
              value={points} onChange={(e) => setPoints(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            <span style={{ fontSize: 11, color: C.muted }}>Puntos — por defecto 1; súbelo para preguntas que valgan más.</span>
          </div>
        </>
      )}

      {type === "corta" && (
        <>
          <label style={S.label}>Respuestas aceptadas (una por línea)</label>
          <textarea style={{ ...S.input, marginBottom: 6, minHeight: 70, resize: "vertical", fontFamily: FONT_SANS }}
            value={acceptedText} onChange={(e) => setAcceptedText(e.target.value)}
            placeholder={"Semicadencia\nCadencia suspensiva"} />
          <p style={{ fontSize: 11, color: C.muted, margin: "0 0 18px", lineHeight: 1.5 }}>
            Cualquiera de estas grafías se acepta como correcta — no distingue mayúsculas, tildes ni espacios sobrantes.
            {accepted.length > 0 && ` Ahora mismo: ${accepted.join(" · ")}`}
          </p>
        </>
      )}

      {type === "test" && (
        <>
          <label style={S.label}>Opciones (marca la correcta)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {options.map((opt, i) => {
              const isCorrect = correctOptionId === opt.id;
              return (
                <div key={opt.id} style={{ ...S.row, gap: 8 }}>
                  <button type="button" onClick={() => setCorrectOptionId(opt.id)}
                    title={isCorrect ? "Esta es la opción correcta" : "Marcar como correcta"}
                    style={{
                      position: "relative",
                      width: 32, height: 32, borderRadius: "50%",
                      background: isCorrect ? C.fnT : C.paper,
                      border:     `1.5px solid ${isCorrect ? C.fnT : C.line}`,
                      color:      isCorrect ? C.paper : C.muted,
                      cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: FONT_SANS,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                    {opt.id}
                    {isCorrect && (
                      <span aria-hidden="true" style={{
                        position: "absolute", top: -4, right: -4, width: 15, height: 15, borderRadius: "50%",
                        background: C.fnT, color: C.paper, border: `1.5px solid ${C.paper}`,
                        fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>✓</span>
                    )}
                  </button>
                  <input style={{ ...S.input, flex: 1 }} value={opt.text}
                    onChange={(e) => updateOpt(i, e.target.value)} placeholder={`Texto de la opción ${opt.id}`} />
                  <button onClick={() => removeOpt(i)} disabled={options.length <= 2}
                    style={{ ...S.btnDanger, padding: "5px 9px", fontSize: 11, ...disabledStyle(options.length > 2), flexShrink: 0 }}>×</button>
                </div>
              );
            })}
          </div>
          <button onClick={addOpt} disabled={options.length >= 6}
            style={{ ...S.btn, width: "100%", marginBottom: 18, fontSize: 12, ...disabledStyle(options.length < 6) }}>
            + Añadir opción
          </button>
        </>
      )}

      {type === "desarrollo" && (
        <>
          <label style={S.label}>Instrumento de corrección</label>
          <div style={{ marginBottom: 14, padding: "10px 12px", background: C.paper2, border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <InstrumentoAttach instrumento={instrumento} onChange={setInstrumento}
              plantillas={plantillasInstrumento} onChangePlantillas={onChangePlantillasInstrumento} />
          </div>
        </>
      )}

      <label style={S.label}>Explicación (opcional)</label>
      <textarea style={{ ...S.input, marginBottom: 6, minHeight: 60, resize: "vertical", fontFamily: FONT_SANS }}
        value={explanation} onChange={(e) => setExplanation(e.target.value)}
        placeholder="Por qué es esa la respuesta correcta…" />
      <p style={{ fontSize: 11, color: C.muted, margin: "0 0 18px", lineHeight: 1.5 }}>
        {type !== "desarrollo"
          ? "En preguntas test y de respuesta corta, la verá el alumno en la corrección, junto a la respuesta correcta."
          : "En preguntas de desarrollo, solo la ves tú — te sirve de pauta al corregir."}
      </p>

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}
