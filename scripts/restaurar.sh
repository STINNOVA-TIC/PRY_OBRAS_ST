#!/bin/sh
# Restaura un respaldo de ST-OBRAS. REEMPLAZA los datos actuales.
# Uso: ./scripts/restaurar.sh 2026-11-17_2330
#      (la fecha es la parte del nombre: bd_<fecha>.dump y adjuntos_<fecha>.tgz)
set -e
DESTINO="${DESTINO:-/home/docker-ubuntu/backups/obras}"
F="$1"
[ -n "$F" ] || { echo "Indica la fecha del respaldo. Disponibles:"; ls "$DESTINO" | sed -n 's/^bd_\(.*\)\.dump$/  \1/p'; exit 1; }
[ -s "$DESTINO/bd_$F.dump" ] || { echo "No existe $DESTINO/bd_$F.dump"; exit 1; }
printf "Esto reemplaza la base y los archivos actuales por el respaldo %s. Escribe SI para continuar: " "$F"
read r; [ "$r" = "SI" ] || { echo "Cancelado"; exit 1; }

docker exec -i obras_v2_db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DESTINO/bd_$F.dump"
if [ -s "$DESTINO/adjuntos_$F.tgz" ]; then
  docker exec -i obras_v2_api tar xzf - -C /app/uploads < "$DESTINO/adjuntos_$F.tgz"
fi
docker restart obras_v2_api >/dev/null
echo "Restaurado el respaldo $F"
