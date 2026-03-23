FROM theasp/novnc:latest

ENV DISPLAY_WIDTH=1280
ENV DISPLAY_HEIGHT=800
ENV RUN_XTERM=yes
ENV RUN_FLUXBOX=yes

RUN apt-get update && apt-get install -y \
    thunar \
    thunar-archive-plugin \
    mousepad \
    ristretto \
    file-roller \
    evince \
    nano \
    curl \
    xdg-utils \
    shared-mime-info \
    dbus \
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/Desktop/evidence

# Add Thunar as a supervised process, same pattern as fluxbox.conf.
# startsecs=5 tells supervisord to wait 5 seconds after fluxbox starts
# before launching Thunar — gives the display time to be ready.
# DISPLAY=:0 matches what the theasp image uses (not :1).
RUN cat > /app/conf.d/thunar.conf << 'EOF'
[program:thunar]
command=bash -c "sleep 5 && dbus-launch thunar /root/Desktop/evidence"
environment=DISPLAY=":0"
autorestart=false
startsecs=0
EOF