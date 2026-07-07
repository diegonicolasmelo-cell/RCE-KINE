/**
 * infra_lock.gs — Concurrencia. Envuelve escrituras en un lock de script.
 * Regla: SOLO las funciones públicas del dispatcher usan conLock().
 * Dentro del lock se llaman versiones internas SIN lock (evita deadlock).
 */

function conLock(fn) {
  const lock = LockService.getScriptLock();
  let got = false;
  try {
    got = lock.tryLock(10000); // no lanza excepción: devuelve boolean
    if (!got) return err('Sistema ocupado (otra escritura en curso). Reintenta.', ERR.LOCK_TIMEOUT);
    return fn();
  } finally {
    if (got) lock.releaseLock();
  }
}
