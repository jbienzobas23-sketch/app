// ═══ MODALES ═════════════════════════════════════════════════════════════════
// Editores y formularios modales (categorías, grupos, cursos, unidades, usuarios,
// audios, preguntas). Extraídos de App.jsx (Fase 2) sin cambiar su lógica.
import { useState, useRef } from "react";
import { C, F, S, FONT_SANS, FONT_MONO, disabledStyle } from "../theme/tokens.js";
import { fmt, uid, toggleInSet } from "../lib/ids.js";
import { fetchAudioBuffer } from "../lib/audio.js";
import { modelOf } from "../lib/domain.js";
import { CATEGORY_COLORS, KEY_SEQUENCE } from "../seed.js";
import { generateSalt, hashCredential } from "../auth/crypto.js";
import { ModalShell, ErrorMsg, CredentialInput, ModalFooter, SuggestInput, TagInput, Overline, GhostButton, CtaButton, FieldLabel } from "./primitives.jsx";

// Editor de categoría (nuevo o existente)
export function CategoryEditorModal({ initialCategory, onSave, onClose }) {
  const isNew = !initialCategory;
  const [name,    setName]    = useState(initialCategory?.name || "");
  const [hasFigures, setHasFigures] = useState(initialCategory?.hasFigures ?? false);
  const [buttons, setButtons] = useState(initialCategory?.buttons || [
    { id: "A", name: "Botón A", color: CATEGORY_COLORS[0], key: KEY_SEQUENCE[0] },
    { id: "B", name: "Botón B", color: CATEGORY_COLORS[1], key: KEY_SEQUENCE[1] },
  ]);
  const maxBtns = hasFigures ? 8 : 6;

  const updateBtn = (i, patch) => setButtons((prev) => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
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
  const removeBtn = (i) => { if (buttons.length > 2) setButtons((prev) => prev.filter((_, idx) => idx !== i)); };

  const canSave = name.trim() && buttons.length >= 2 && buttons.every((b) => b.id.trim() && b.name.trim() && b.key.trim().length === 1);

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
    <ModalShell width={520} align="top">
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
              style={{ ...S.input, width: 50, fontFamily: FONT_MONO, fontWeight: 700, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={4} placeholder="ID" />
            <input value={b.name} onChange={(e) => updateBtn(i, { name: e.target.value })}
              style={{ ...S.input, flex: 1, padding: "6px 10px", minWidth: 0 }} placeholder="Nombre" />
            <input value={b.key} onChange={(e) => updateBtn(i, { key: e.target.value.slice(0, 1) })}
              style={{ ...S.input, width: 36, fontFamily: FONT_MONO, textAlign: "center", padding: "6px 4px", flexShrink: 0 }}
              maxLength={1} placeholder="t" />
            <button onClick={() => removeBtn(i)} disabled={buttons.length <= 2}
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
export function GroupEditorModal({ initial, students, currentUserId, onSave, onClose }) {
  const [name,       setName]       = useState(initial?.name || "");
  const [studentIds, setStudentIds] = useState(() => new Set(initial?.studentIds || []));

  const toggleStudent = (id) => setStudentIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
    <ModalShell width={480} align="top">
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
                <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_MONO }}>@{s.username}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear grupo"} />
    </ModalShell>
  );
}

export function CourseFormModal({ initial, groups = [], onSave, onClose }) {
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
    <ModalShell width={480}>
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
export function UnitFormModal({ initial, onSave, onClose }) {
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
    <ModalShell width={440}>
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
export function ExercisePickerModal({ exercises, alreadyInUnit, onAdd, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const inUnit    = new Set(alreadyInUnit);
  const available = exercises.filter((e) => !inUnit.has(e.id));
  const toggle    = (id) => setSelected((s) => toggleInSet(s, id));

  return (
    <ModalShell width={520} align="top">
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
            const isSel = selected.has(ex.id);
            return (
              <label key={ex.id}
                style={{ ...S.row, gap: 10, padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: isSel ? "rgba(26,25,21,0.04)" : "transparent" }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(ex.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{ex.title}</div>
                  <div style={{ ...S.row, gap: 6 }}>
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(ex.duration)}</span>
                    {(() => {
                      const isQuiz = modelOf(ex) === "cuestionario";
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
export function AddUserModal({ forRole, currentUserId, existingUsernames, onSave, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [username,    setUsername]    = useState("");
  const [credType,    setCredType]    = useState(forRole === "student" ? "pin" : "password");
  const [credValue,   setCredValue]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const isPin   = credType === "pin";
  const minLen  = isPin ? 4 : 6;
  const taken   = username.trim() && existingUsernames.includes(username.trim().toLowerCase());
  const canSave = displayName.trim() && username.trim() && credValue.length >= minLen && !taken && !loading;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({
        id:           uid(forRole),
        username:     username.trim().toLowerCase(),
        displayName:  displayName.trim(),
        role:         forRole,
        credType,
        passwordHash: hash,
        salt,
        ...(forRole === "student" ? { teacherId: currentUserId } : {}),
        createdBy:    currentUserId,
        createdAt:    Date.now(),
      });
    } catch { setError("Error al crear la cuenta."); }
    finally  { setLoading(false); }
  };

  const roleLabel = forRole === "teacher" ? "profesor" : "alumno";

  return (
    <ModalShell width={420}>
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
export function ResetCredentialModal({ targetUser, onSave, onClose }) {
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
      const salt = generateSalt();
      const hash = await hashCredential(credValue, salt);
      onSave({ ...targetUser, credType, passwordHash: hash, salt });
    } catch { setError("Error al actualizar la credencial."); }
    finally  { setLoading(false); }
  };

  return (
    <ModalShell width={420}>
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

// Modal para configurar el correo de recuperación en el primer login
export function RecoveryEmailModal({ onSave, onSkip }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = async () => {
    if (!valid || loading) return;
    setLoading(true); setError("");
    try { await onSave(email.trim().toLowerCase()); }
    catch { setError("Error al guardar el correo. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ marginBottom: 30, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <Overline>Primer acceso</Overline>
          <h1 style={{ ...S.h1 }}>Correo de recuperación</h1>
        </div>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 24 }}>
          Añade un correo para poder recuperar tu acceso si olvidas tu PIN. Puedes saltarte este paso, pero no podrás recuperar tu cuenta sin ayuda del profesor.
        </p>
        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Correo electrónico</FieldLabel>
          <input
            type="email"
            style={{ ...S.input }}
            value={email}
            autoFocus
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="correo@ejemplo.com"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {error && <ErrorMsg style={{ marginBottom: 12 }}>{error}</ErrorMsg>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
          <CtaButton full lg onClick={handleSave} disabled={!valid || loading}>
            {loading ? "Guardando…" : "Guardar y continuar →"}
          </CtaButton>
          <GhostButton full lg onClick={onSkip}>Ahora no</GhostButton>
        </div>
      </div>
    </div>
  );
}

// Picker para elegir un audio del almacén
export function AudioLibraryPickerModal({ library, onPick, onClose }) {
  const [previewId, setPreviewId] = useState(null);
  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: C.ink }}>Elegir audio del almacén</h3>

      {library.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          
          <div>El almacén está vacío.</div>
          <div style={{ fontSize: 12 }}>Pide al administrador que añada audios.</div>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 6, marginBottom: 16 }}>
          {library.map((audio) => {
            const isPrev = previewId === audio.id;
            return (
              <div key={audio.id} style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 4, background: isPrev ? "rgba(26,25,21,0.04)" : "transparent", transition: "background .1s" }}>
                <div style={{ ...S.row, gap: 10, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink, marginBottom: audio.composer ? 1 : (audio.description ? 2 : 4), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.title}</div>
                    {audio.composer && <div style={{ fontSize: 11, color: C.fnS, fontWeight: 500, marginBottom: audio.description ? 2 : 4 }}>{audio.composer}</div>}
                    {audio.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audio.description}</div>}
                    <span style={{ ...S.badge, background: C.line, color: C.muted, fontFamily: FONT_MONO }}>{fmt(audio.duration)}</span>
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
export function AudioLibraryFormModal({ initial, allTags = [], allComposers = [], onSave, onClose }) {
  const [title,       setTitle]       = useState(initial?.title || "");
  const [composer,    setComposer]    = useState(initial?.composer || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags,        setTags]        = useState(initial?.tags || []);
  const [url,         setUrl]         = useState(initial?.url || "");
  const [duration,    setDuration]    = useState(initial?.duration || null);
  const [detecting,   setDetecting]   = useState(false);
  const [error,       setError]       = useState("");

  // BUG FIX: cancelación de detecciones obsoletas también aquí
  const urlReqRef = useRef(0);
  const handleUrlChange = (newUrl) => {
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

  const canSave = title.trim() && url.trim() && duration && !detecting;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:          initial?.id || uid("audio"),
      title:       title.trim(),
      composer:    composer.trim(),
      description: description.trim(),
      tags,
      url:         url.trim(),
      duration,
      createdAt:   initial?.createdAt || Date.now(),
    });
  };

  return (
    <ModalShell width={480} align="top">
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
      {duration && !detecting && <p style={{ fontSize: 12, color: C.fnT, margin: "0 0 14px" }}>✓ Duración detectada: {fmt(duration)}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      <div style={{ marginBottom: 8 }} />

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Añadir"} />
    </ModalShell>
  );
}

// Editor de pregunta (test o desarrollo)
export function QuestionEditorModal({ initial, defaultStart, audioDuration, onSave, onClose }) {
  const [text,            setText]            = useState(initial?.text || "");
  const [type,            setType]            = useState(initial?.type || "test");
  const [audioStart,      setAudioStart]      = useState(initial?.audioStart ?? defaultStart ?? 0);
  const [audioEnd,        setAudioEnd]        = useState(initial?.audioEnd   ?? Math.min(audioDuration, (defaultStart ?? 0) + 10));
  const [options,         setOptions]         = useState(initial?.options || [
    { id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState(initial?.correctOptionId || "A");

  const updateOpt = (i, txt) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, text: txt } : o));
  const addOpt = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, { id: String.fromCharCode(65 + prev.length), text: "" }]);
  };
  const removeOpt = (i) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, id: String.fromCharCode(65 + idx) }));
      if (correctOptionId && !next.some((o) => o.id === correctOptionId)) setCorrectOptionId(next[0].id);
      return next;
    });
  };

  const canSave =
    text.trim() &&
    audioEnd > audioStart &&
    (type !== "test" || (options.every((o) => o.text.trim()) && correctOptionId));

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id:         initial?.id || uid("q"),
      text:       text.trim(),
      type,
      audioStart: parseFloat(audioStart),
      audioEnd:   parseFloat(audioEnd),
      options:    type === "test" ? options.map((o) => ({ ...o, text: o.text.trim() })) : [],
      correctOptionId: type === "test" ? correctOptionId : null,
    });
  };

  return (
    <ModalShell width={560} align="top">
      <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: C.ink }}>{initial ? "Editar pregunta" : "Nueva pregunta"}</h3>

      <label style={S.label}>Tipo</label>
      <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
        {[{ id: "test", label: "Tipo test" }, { id: "desarrollo", label: "Desarrollo" }].map((opt) => (
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

      <div style={{ ...S.row, gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Inicio (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioStart} onChange={(e) => setAudioStart(parseFloat(e.target.value) || 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Fin (s)</label>
          <input type="number" min={0} max={audioDuration} step={0.1} style={S.input}
            value={audioEnd} onChange={(e) => setAudioEnd(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

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
                      width: 32, height: 32, borderRadius: "50%",
                      background: isCorrect ? C.fnT : C.paper,
                      border:     `1.5px solid ${isCorrect ? C.fnT : C.line}`,
                      color:      isCorrect ? C.paper : C.muted,
                      cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: FONT_MONO,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                    {opt.id}
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

      <ModalFooter onCancel={onClose} onSave={handleSave} canSave={canSave} saveLabel={initial ? "Guardar" : "Crear"} />
    </ModalShell>
  );
}
