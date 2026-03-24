FROM theasp/novnc:latest

ENV DISPLAY_WIDTH=1280
ENV DISPLAY_HEIGHT=800
ENV RUN_XTERM=no
ENV RUN_FLUXBOX=yes

# Install file manager and viewers
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
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create a student user.
# Given Sudo so they can install tools themselves
RUN useradd -m -s /bin/bash student && \
    echo "student:student" | chpasswd && \
    usermod -aG sudo student

# Create the evidence folder owned by student.
RUN mkdir -p /home/student/Desktop/evidence && \
    chown -R student:student /home/student/Desktop

# Tell the theasp/novnc image to run as the student user.
# The base image respects this environment variable.
ENV VNC_USER=student

# Supervisord config for Thunar — opens automatically showing the evidence folder.
# Runs as student user, waits 5s for the desktop to be ready first.
RUN cat > /app/conf.d/thunar.conf << 'EOF'
[program:thunar]
command=bash -c "sleep 5 && dbus-launch --exit-with-session thunar /home/student/Desktop/evidence"
environment=DISPLAY=":0",HOME="/home/student",USER="student"
user=student
autorestart=false
startsecs=0
EOF