# ⚠️ ESTA RAMA NO SE PUBLICA

**Rama:** `prototipo-plantillas-evolucion`
**Estado:** prototipo en evaluación — **NO es código de producción**
**Pedido de Diego (2-sep-2026):** *«que no se confunda con las implementaciones
de Manuel, ya que algo que está en prueba podría pasar a ser parte de la
plataforma sin que esté correctamente funcionando»*

---

## Reglas de esta rama

1. **NO se fusiona** a `develop` ni a `main` hasta que Diego lo apruebe
   explícitamente después de probarlo.
2. **NO se pega en el editor de Apps Script de producción.** Ni el `index.html`
   ni los `.gs` de esta rama.
3. **NO se usa `build/que_pegar.js` contra esta rama** para armar una entrega.
4. Si alguien necesita el código de producción, es **`main`** (o `develop` para
   lo aprobado y pendiente de publicar). **Nunca esta.**

## Qué contiene

El prototipo de **plantillas de evolución** (ver `PRD_PLANTILLAS_EVOLUCION.md`
en `develop`):

- Barra bajo la fase clínica con la **evolución tipo** del colega de la cama y
  el **relato del turno** (los eventos se encadenan por hora).
- Catálogo por cama en tres estantes: del colega asignado → de la unidad → de
  otros colegas.
- Editor de plantillas con comodines.
- `build/prototipo_plantillas.js`: arma la **página de prueba** (el index real +
  un puente simulado + 4 camas de mentira, sin RUT ni datos reales).

## Cómo se prueba SIN tocar la app del equipo

**Página de prueba** — no toca nada, no guarda nada, datos inventados:

```bash
node build/prototipo_plantillas.js salida.html
```

Se abre con doble clic en Chrome. Es la vía recomendada mientras el diseño
todavía se está decidiendo.

## Estado de la batería

**108 verdes.** `paridad_v3.js` sale **roja a propósito**: vigila que el espejo
de producción (`V3 colaborativa/`) esté al día con `v2/`, y en una rama de
prototipo ese espejo **no debe regenerarse** — justamente para que este código
no pueda pegarse en producción por accidente.

Si algún día esta rama se aprueba, ahí sí se regenera el espejo y se arma la
entrega como cualquier otra.
