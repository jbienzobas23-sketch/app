import { describe, it, expect, vi } from "vitest";
import { createDb } from "./db.js";

// Cliente Supabase falso: cada llamada a upsert() se resuelve según la cola de
// resultados dada (error/éxito), en el orden en que este test los necesite.
const makeFakeClient = (results) => {
  let call = 0;
  const upsert = vi.fn(() => {
    const r = results[Math.min(call, results.length - 1)];
    call++;
    if (r === "throw") return Promise.reject(new Error("network down"));
    return Promise.resolve(r);
  });
  return { from: () => ({ upsert }), _upsert: upsert, callCount: () => call };
};

describe("createDb — reintento exponencial (F7, T7.4)", () => {
  it("cliente falso que falla dos veces: reintenta y acaba guardando sin avisar", async () => {
    const client = makeFakeClient([
      { error: { message: "fail 1" } },
      { error: { message: "fail 2" } },
      { error: null },
    ]);
    const pendingSavesRef = { current: 0 };
    const onError = vi.fn();
    const sleep = vi.fn(() => Promise.resolve());
    const { dbUpsertUser } = createDb({ getClient: () => client, pendingSavesRef, onError, sleep });

    await dbUpsertUser({ id: "u1", displayName: "Ana" });

    expect(client._upsert).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 3000);
    expect(onError).not.toHaveBeenCalled();
    expect(pendingSavesRef.current).toBe(0);
  });

  it("agota los 3 reintentos (4 intentos en total): avisa una sola vez, con el último error", async () => {
    const client = makeFakeClient([
      { error: { message: "fail 1" } },
      { error: { message: "fail 2" } },
      { error: { message: "fail 3" } },
      { error: { message: "fail final" } },
    ]);
    const pendingSavesRef = { current: 0 };
    const onError = vi.fn();
    const sleep = vi.fn(() => Promise.resolve());
    const { dbUpsertUser } = createDb({ getClient: () => client, pendingSavesRef, onError, sleep });

    await dbUpsertUser({ id: "u1" });

    expect(client._upsert).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 3000, 9000]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ table: "fa_users", message: "fail final" });
    expect(pendingSavesRef.current).toBe(0);
  });

  it("pendingSavesRef sigue contando durante los reintentos, no baja hasta el final", async () => {
    const client = makeFakeClient([{ error: { message: "fail" } }, { error: null }]);
    const pendingSavesRef = { current: 0 };
    let sawPendingDuringRetry = false;
    const sleep = vi.fn(() => {
      // En el hueco entre el intento 1 (fallido) y el 2 (reintento), la
      // escritura sigue "en vuelo" — el contador no debe haber bajado ya.
      sawPendingDuringRetry = pendingSavesRef.current === 1;
      return Promise.resolve();
    });
    const { dbUpsertUser } = createDb({ getClient: () => client, pendingSavesRef, sleep });

    expect(pendingSavesRef.current).toBe(0);
    await dbUpsertUser({ id: "u1" });

    expect(sawPendingDuringRetry).toBe(true);
    expect(pendingSavesRef.current).toBe(0);
  });

  it("acierta a la primera: ni reintenta ni avisa", async () => {
    const client = makeFakeClient([{ error: null }]);
    const pendingSavesRef = { current: 0 };
    const onError = vi.fn();
    const sleep = vi.fn(() => Promise.resolve());
    const { dbUpsertUser } = createDb({ getClient: () => client, pendingSavesRef, onError, sleep });

    await dbUpsertUser({ id: "u1" });

    expect(client._upsert).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("una excepción (red caída) también cuenta como fallo reintentable", async () => {
    const client = makeFakeClient(["throw", "throw", { error: null }]);
    const sleep = vi.fn(() => Promise.resolve());
    const onError = vi.fn();
    const { dbUpsertUser } = createDb({ getClient: () => client, pendingSavesRef: { current: 0 }, onError, sleep });

    await dbUpsertUser({ id: "u1" });

    expect(client._upsert).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it("sin cliente (modo en memoria), no hace nada — ni error ni reintentos", async () => {
    const sleep = vi.fn();
    const pendingSavesRef = { current: 0 };
    const { dbUpsertUser } = createDb({ getClient: () => null, pendingSavesRef, sleep });

    await dbUpsertUser({ id: "u1" });

    expect(sleep).not.toHaveBeenCalled();
    expect(pendingSavesRef.current).toBe(0);
  });
});
