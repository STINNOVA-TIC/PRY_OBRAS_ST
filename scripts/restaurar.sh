#!/bin/sh
# Restaura un respaldo de ST-OBRAS. REEMPLAZA los datos actuales.
# Uso, en la carpeta del proyecto:
#   sh scripts/restaurar.sh                    → lista los respaldos disponibles
#   sh scripts/restaurar.sh 2026-11-17_233000    → restaura ese respaldo
set -e
F="$1"
if [ -z "$F" ]; then
  echo "Respaldos disponibles:"; docker exec obras_v2_backup sh -c 'ls /backups' | sed -n 's/^bd_\(.*\)\.dump$/  \1/p'; exit 1
fi
docker exec obras_v2_backup test -s "/backups/bd_$F.dump" || { echo "No existe el respaldo bd_$F.dump"; exit 1; }
printf "Esto reemplaza la base y los archivos actuales por el respaldo %s. Escribe SI para continuar: " "$F"
read r; [ "$r" = "SI" ] || { echo "Cancelado"; exit 1; }

# Respaldo de seguridad del estado actual antes de restaurar
docker exec obras_v2_backup /bin/sh /scripts/respaldo.sh >/dev/null && echo "Se respaldó el estado actual antes de restaurar"

docker exec obras_v2_backup sh -c "pg_restore --clean --if-exists --no-owner -d \"\$PGDATABASE\" /backups/bd_$F.dump"
if docker exec obras_v2_backup test -s "/backups/adjuntos_$F.tgz"; then
  docker exec obras_v2_backup cat "/backups/adjuntos_$F.tgz" | docker exec -i obras_v2_api tar xzf - -C /app/uploads
fi
docker restart obras_v2_api >/dev/null
echo "Restaurado el respaldo $F"
