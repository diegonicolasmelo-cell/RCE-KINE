# Ideas archivadas — variables derivables del registro existente

> Clasificaciones e indicadores que se pueden calcular automáticamente con el
> patrón ya probado (acumular eventos del episodio por turno + derivar la clase
> al mostrar, sin pedir ningún dato nuevo al kinesiólogo). Implementados hasta
> ahora: **clasificación de weaning (Boles 2007)**, **candidato a PVE** e
> **ICU-AW (MRC-SS <48)**. El resto queda aquí para más adelante.

## Respiratorio / weaning
- **Fracaso de extubación** — reintubación <48–72 h post extubación programada.
  La hoja REINTUBACIONES ya guarda el tiempo extubado → tasa de calidad mensual
  (esperable <10–15%).
- **Fracaso de VNI/CNAF** — escalada a intubación dentro de 48 h de iniciado el
  soporte no invasivo. Los cambios de soporte ya quedan fechados en el episodio.
- **Trayectoria del índice ROX** — ya se calcula por turno en CNAF; el acumulado
  permitiría mostrar tendencia (subiendo = seguro, cayendo = alerta de fracaso).
- **VM prolongada formal** — ≥21 días (consenso NAMDRC), distinto de la alerta
  actual de 14 d → gatilla la conversación de TQT/cronicidad.
- **Weaning de decanulación** — días de TQT, decanulación fallida (recanulado ya
  es evento fechado), tiempo TQT→decanulación.

## Motor / funcional
- **Trayectoria funcional** — delta de CPAx/FSS-ICU entre primera y última
  medición del episodio → "mejorando / estancado / retrocediendo".
- **Dosis de rehabilitación** — % de turnos del episodio con KTM realizada y
  nivel máximo alcanzado; días desde ingreso hasta primera movilización activa
  (movilización precoz es indicador SOCHIMI).
- **Días hasta despertar cooperador** — primer turno con S5Q ≥3 desde el ingreso.

## Gestión / REM
- Tasa mensual de reintubación, de fracaso de VNI, de decanulación exitosa,
  mediana de días de VM y de weaning — todos derivables de los mismos
  acumulados; se sumarían al generador REM.
