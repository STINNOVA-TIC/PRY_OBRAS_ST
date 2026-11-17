#!/bin/sh
# Respaldo completo de ST-OBRAS (corre dentro del contenedor obras_v2_backup).
# - Base de datos: toda la información (obras, usuarios, avances, bodega, planillas, bitácora...).
# - Adjuntos: todas las firmas, PDF y fotos subidas.
# NO borra respaldos anteriores: se conservan todos.
set -e
DESTINO="${DESTINO:-/backups}"
ORIGEN="${ORIGEN:-/uploads}"
FECHA=$(date +%F_%H%M%S)
LOG="$DESTINO/respaldo.log"
mkdir -p "$DESTINO"
# Se escribe en temporales propios de esta ejecución y se renombran solo si todo salió bien
TMP_BD="$DESTINO/.bd_$FECHA.$$.tmp"
TMP_ADJ="$DESTINO/.adjuntos_$FECHA.$$.tmp"

falla() { rm -f "$TMP_BD" "$TMP_ADJ"; echo "$(date '+%F %T') ERROR: $1" >> "$LOG"; echo "ERROR: $1" >&2; exit 1; }

# 1) Base de datos (PGHOST, PGUSER, PGPASSWORD y PGDATABASE vienen del docker-compose)
pg_dump -F c -f "$TMP_BD" || falla "no se pudo respaldar la base"

# 2) Archivos subidos
tar czf "$TMP_ADJ" -C "$ORIGEN" . || falla "no se pudieron respaldar los adjuntos"

# 3) Que ninguno quede vacío
[ -s "$TMP_BD" ] || falla "el respaldo de la base quedó vacío"
[ -s "$TMP_ADJ" ] || falla "el respaldo de adjuntos quedó vacío"
# Nunca sobrescribir un respaldo existente
[ ! -e "$DESTINO/bd_$FECHA.dump" ] || FECHA="${FECHA}_$$"
mv "$TMP_BD" "$DESTINO/bd_$FECHA.dump"
mv "$TMP_ADJ" "$DESTINO/adjuntos_$FECHA.tgz"

# 4) Espacio en disco (no se borra nada: solo avisa)
LIBRE=$(df -P "$DESTINO" | awk 'NR==2 {print 100 - $5}')
[ "$LIBRE" -ge 15 ] || echo "$(date '+%F %T') AVISO: queda ${LIBRE}% de disco libre; copia los respaldos fuera del servidor" >> "$LOG"

echo "$(date '+%F %T') OK bd=$(du -h "$DESTINO/bd_$FECHA.dump" | cut -f1) adjuntos=$(du -h "$DESTINO/adjuntos_$FECHA.tgz" | cut -f1) total=$(du -sh "$DESTINO" | cut -f1) disco_libre=${LIBRE}%" >> "$LOG"
echo "Respaldo $FECHA listo"
