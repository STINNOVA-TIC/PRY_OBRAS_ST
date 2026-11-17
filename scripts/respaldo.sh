#!/bin/sh
# Respaldo de ST-OBRAS: base de datos + archivos subidos (firmas, PDF, fotos).
# Uso: ./scripts/respaldo.sh            (lo programa cron todas las noches)
# Guarda en /home/docker-ubuntu/backups/obras. NO borra ningún respaldo anterior: se conservan todos.
set -e
DESTINO="${DESTINO:-/home/docker-ubuntu/backups/obras}"
FECHA=$(date +%F_%H%M)
mkdir -p "$DESTINO"

# 1) Base de datos (formato comprimido de PostgreSQL)
docker exec obras_v2_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$DESTINO/bd_$FECHA.dump"

# 2) Archivos subidos (volumen montado en /app/uploads del contenedor de la API)
docker exec obras_v2_api tar czf - -C /app/uploads . > "$DESTINO/adjuntos_$FECHA.tgz"

# 3) Verificación mínima: que ninguno quede vacío
for f in "$DESTINO/bd_$FECHA.dump" "$DESTINO/adjuntos_$FECHA.tgz"; do
  [ -s "$f" ] || { echo "$(date '+%F %T') ERROR: $f quedó vacío" >> "$DESTINO/respaldo.log"; exit 1; }
done

# 4) Espacio libre en disco (no se borra nada: avisa en el log si queda poco)
LIBRE=$(df -P "$DESTINO" | awk 'NR==2 {print 100 - $5}')
[ "$LIBRE" -ge 15 ] || echo "$(date '+%F %T') AVISO: queda ${LIBRE}% de disco libre; copia los respaldos fuera del servidor" >> "$DESTINO/respaldo.log"

echo "$(date '+%F %T') OK bd=$(du -h "$DESTINO/bd_$FECHA.dump" | cut -f1) adjuntos=$(du -h "$DESTINO/adjuntos_$FECHA.tgz" | cut -f1) total=$(du -sh "$DESTINO" | cut -f1) disco_libre=${LIBRE}%" >> "$DESTINO/respaldo.log"
