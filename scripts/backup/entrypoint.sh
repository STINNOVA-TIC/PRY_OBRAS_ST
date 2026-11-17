#!/bin/sh
# Programa el respaldo con cron dentro del contenedor y lo deja corriendo.
set -e
HORARIO="${BACKUP_CRON:-30 23 * * *}"
mkdir -p /backups
echo "$HORARIO /bin/sh /scripts/respaldo.sh >> /backups/cron.log 2>&1" > /etc/crontabs/root
echo "$(date '+%F %T') Contenedor de respaldo iniciado; horario: $HORARIO" >> /backups/respaldo.log
# Espera a que la base responda y saca un respaldo al arrancar (desactivable con BACKUP_AL_INICIAR=false)
if [ "${BACKUP_AL_INICIAR:-true}" = "true" ]; then
  i=0; until pg_isready -q || [ $i -ge 30 ]; do i=$((i+1)); sleep 2; done
  /bin/sh /scripts/respaldo.sh || true
fi
exec crond -f -l 8
