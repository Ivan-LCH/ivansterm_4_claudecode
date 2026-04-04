# IvansTerm 개발/운영 이미지 (SSH/빌드도구 포함)
FROM python:3.11

# 1. 필수 패키지 및 Node.js 설치
RUN apt-get update && apt-get install -y \
    openssh-server \
    curl \
    git \
    vim \
    tmux \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. SSH 설정
RUN mkdir -p /var/run/sshd
RUN echo 'root:password' | chpasswd
RUN echo "PermitRootLogin yes" >> /etc/ssh/sshd_config && \
    echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config

# 3. SSH 세션에서 컨테이너 환경변수 상속
RUN echo '#!/bin/bash\n\
# Load container environment variables for SSH sessions\n\
if [ -f /app/.env ]; then\n\
    set -a\n\
    source /app/.env\n\
    set +a\n\
fi' > /etc/profile.d/load-env.sh && chmod +x /etc/profile.d/load-env.sh

# 4. 작업 디렉토리 설정
WORKDIR /app

# 5. Python 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Frontend 의존성 설치 (폐쇄망 대비)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --legacy-peer-deps

# 7. 엔트리포인트 설정
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22 8000
ENTRYPOINT ["/entrypoint.sh"]
