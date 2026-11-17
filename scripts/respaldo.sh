#!/bin/sh
# Saca un respaldo AHORA (además del automático de cada noche), usando el contenedor de respaldo.
# Uso, en la carpeta del proyecto:  sh scripts/respaldo.sh
docker exec obras_v2_backup /bin/sh /scripts/respaldo.sh && docker exec obras_v2_backup tail -n 3 /backups/respaldo.log
