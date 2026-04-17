FROM evoapicloud/evolution-api:latest

ENV DOCKER_ENV=true \
    SERVER_PORT=8080 \
    SERVER_DISABLE_MANAGER=false \
    SERVER_DISABLE_DOCS=false \
    AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
