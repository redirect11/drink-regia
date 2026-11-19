# L'IMMAGINE DEL LAVORO DELLA FLOTTA (REQ-FLOTTA-138, infra/README.md).
# Gli strumenti dei workflow alle stesse versioni (Node 22, Terraform 1.9.8,
# firebase-tools 15.36.0, gcloud), gli script della regia e il Terraform dei
# locali. Si costruisce dalla radice del repository:
#   gcloud builds submit --config infra/flotta/cloudbuild.yaml --ignore-file infra/flotta/.gcloudignore
# e si ricostruisce a ogni rilascio della regia: il lavoro deve fare quello
# che fa il codice di quel rilascio.
FROM node:22-bookworm-slim

ARG TERRAFORM_VERSIONE=1.9.8
ARG FIREBASE_TOOLS_VERSIONE=15.36.0

# gcloud dal repository di Google, zip per l'archivio delle eliminazioni.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg unzip zip \
 && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends google-cloud-cli \
 && rm -rf /var/lib/apt/lists/*

# Terraform, controllato con le impronte pubblicate da HashiCorp.
RUN cd /tmp \
 && curl -fsSLO "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSIONE}/terraform_${TERRAFORM_VERSIONE}_linux_amd64.zip" \
 && curl -fsSLO "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSIONE}/terraform_${TERRAFORM_VERSIONE}_SHA256SUMS" \
 && grep " terraform_${TERRAFORM_VERSIONE}_linux_amd64.zip$" "terraform_${TERRAFORM_VERSIONE}_SHA256SUMS" | sha256sum -c - \
 && unzip -q "terraform_${TERRAFORM_VERSIONE}_linux_amd64.zip" -d /usr/local/bin \
 && rm -f terraform_*

# La stessa firebase-tools del pacchetto: il lavoro rifiuta un pacchetto
# che ne chiede un'altra (scripts/flotta-lavoro.mjs).
RUN npm install -g "firebase-tools@${FIREBASE_TOOLS_VERSIONE}" && npm cache clean --force
ENV FIREBASE_TOOLS_VERSIONE=${FIREBASE_TOOLS_VERSIONE}

WORKDIR /regia
# Le dipendenze degli script (firebase-admin) stanno in functions/: prima il
# lock, così lo strato si rifà solo quando cambia.
COPY functions/package.json functions/package-lock.json functions/
RUN npm ci --prefix functions --omit=dev --ignore-scripts && npm cache clean --force
COPY functions/ functions/
COPY scripts/ scripts/
COPY infra/istanza/ infra/istanza/
# Il package.json della radice dice a Node che gli script sono moduli.
COPY package.json ./

# Il lavoro non gira come root. Terraform scarica i suoi provider in
# /regia/infra/istanza/.terraform: la cartella è dell'utente del lavoro.
RUN chown -R node:node /regia/infra/istanza
USER node
ENV HOME=/tmp
ENTRYPOINT ["node", "scripts/flotta-lavoro.mjs"]
