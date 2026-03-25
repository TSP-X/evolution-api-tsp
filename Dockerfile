FROM atendai/evolution-api:v2.2.3

ENV SERVER_PORT=${PORT:-8080}

EXPOSE ${PORT:-8080}
