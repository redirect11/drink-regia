# ── UN'ISTANZA DELLA FLOTTA: il progetto Firebase di un locale ──────────
#
# REQ-FLOTTA-006, docs/flotta-nella-regia.md. Dallo slug nasce
# `drinkpos-<slug>` con tutto quello che l'app si aspetta: le API, Firebase,
# Firestore in europe-west1, un sito Hosting, la web app (la cui config
# diventa il .env della build), Auth. Le regole, gli indici, le Functions e
# l'app li pubblica il workflow dopo l'apply, con firebase-tools.
#
# Sta nella regia dal 29/10/2026 (l'utente: «questa roba dovrebbe essere in
# drink-regia»): attivare un locale è il mestiere della regia, e qui ogni
# regia (test e produzione) passa i suoi valori dal suo environment GitHub.
# Prima stava in tana-drink/infra/istanza, con l'account della regia
# scritto fisso: un locale creato dalla regia di test non si fidava di lei.

terraform {
  required_version = ">= 1.6"
  required_providers {
    google      = { source = "hashicorp/google", version = "~> 6.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 6.0" }
  }
  backend "gcs" {
    # bucket e prefisso li passa il workflow: -backend-config="bucket=…"
    # -backend-config="prefix=istanze/<slug>"
  }
}

variable "slug" {
  description = "Lo slug del locale (minuscole, cifre, trattini, 6-30 caratteri)."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.slug))
    error_message = "Slug non valido."
  }
}

variable "billing_account" {
  description = "L'id dell'account di fatturazione Blaze (per le prove, il secondo account)."
  type        = string
}

variable "org_id" {
  description = "L'organizzazione Google Cloud, se c'è. Vuota: il progetto deve esistere già (creato dall'utente) e viene importato."
  type        = string
  default     = ""
}

variable "regione" {
  type    = string
  default = "europe-west1"
}

variable "ambiente" {
  description = "produzione | test: quale regia ha creato il locale (un'etichetta sul progetto)."
  type        = string
  validation {
    condition     = contains(["produzione", "test"], var.ambiente)
    error_message = "ambiente è produzione o test."
  }
}

variable "regia_sa_email" {
  description = "Il service account di runtime delle Functions della regia che ha creato il locale: scrive la licenza (sospensione, chiusura) nell'istanza. Senza valore predefinito, apposta: ogni regia passa il suo."
  type        = string
}

variable "provisioning_sa_email" {
  description = "Il service account che fa il deploy dal workflow: riceve i ruoli sul progetto nuovo."
  type        = string
  default     = ""
}

# IL PROFILO (REQ-FLOTTA-015). Il leggero è il piano Free: Firestore, sito
# e accesso, che restano nelle soglie gratuite di Google. La fatturazione
# resta collegata anche qui: senza, Google non accende l'accesso con email
# (initializeAuth: BILLING_NOT_ENABLED, provato su drinkpos-prova-free il
# 30/10/2026; la guida Firebase a Terraform chiede il Blaze). Il costo da
# fermo viene da Functions, build, immagini e Storage, e il leggero non li
# ha. Quando il locale compra, lo stesso apply col profilo completo aggiunge
# il resto (aggiorna-istanza.yml).
variable "profilo" {
  description = "completo (Functions, Storage, segreti) | leggero (il piano Free: solo Firestore, sito e accesso)."
  type        = string
  default     = "completo"
  validation {
    condition     = contains(["completo", "leggero"], var.profilo)
    error_message = "profilo è completo o leggero."
  }
}

locals {
  # Il prefisso è quello di src/lib/prodotto.js (PREFISSO_PROGETTI).
  progetto = "drinkpos-${var.slug}"
  completo = var.profilo == "completo"
  api_base = [
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
    "identitytoolkit.googleapis.com",
    "firebasehosting.googleapis.com",
    "serviceusage.googleapis.com",
    "firebaseappcheck.googleapis.com",
  ]
  api_completo = [
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "eventarc.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    # Quelle che il primo deploy delle Functions cerca (provato sul test
    # della regia, 29/10/2026, docs/actions-come-tana-drink.md §3).
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudbilling.googleapis.com",
    "firebaseextensions.googleapis.com",
    # Lo Storage dell'app: il bucket lo crea scripts/storage-istanza.mjs.
    "firebasestorage.googleapis.com",
  ]
  api = concat(local.api_base, local.completo ? local.api_completo : [])
}

resource "google_project" "istanza" {
  provider        = google-beta
  project_id      = local.progetto
  name            = local.progetto
  org_id          = var.org_id != "" ? var.org_id : null
  billing_account = var.billing_account
  deletion_policy = "PREVENT"
  labels = {
    prodotto = "drink"
    slug     = var.slug
    ambiente = var.ambiente
    profilo  = var.profilo
  }
}

resource "google_project_service" "api" {
  provider           = google-beta
  for_each           = toset(local.api)
  project            = google_project.istanza.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firebase_project" "firebase" {
  provider   = google-beta
  project    = google_project.istanza.project_id
  depends_on = [google_project_service.api]
}

resource "google_firestore_database" "db" {
  provider    = google-beta
  project     = google_project.istanza.project_id
  name        = "(default)"
  location_id = var.regione
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_firebase_project.firebase]
}

# Lo Storage dell'app (foto e file del locale) qui non c'è: il bucket
# predefinito `<progetto>.firebasestorage.app` lo può creare solo l'API di
# Firebase Storage, non Cloud Storage («Another user owns the domain»).
# Lo crea scripts/storage-istanza.mjs dal workflow, dopo questo apply.

resource "google_firebase_web_app" "app" {
  provider     = google-beta
  project      = google_project.istanza.project_id
  display_name = local.progetto
  depends_on   = [google_firebase_project.firebase]
}

data "google_firebase_web_app_config" "app" {
  provider   = google-beta
  project    = google_project.istanza.project_id
  web_app_id = google_firebase_web_app.app.app_id
}

resource "google_firebase_hosting_site" "sito" {
  provider = google-beta
  project  = google_project.istanza.project_id
  site_id  = local.progetto
  app_id   = google_firebase_web_app.app.app_id
}

resource "google_identity_platform_config" "auth" {
  provider = google-beta
  project  = google_project.istanza.project_id
  sign_in {
    email {
      enabled           = true
      password_required = true
    }
  }
  depends_on = [google_project_service.api]
}

# Il service account del deploy (come quello della Tana): pubblica hosting,
# functions e regole dal workflow.
resource "google_service_account" "deploy" {
  provider     = google-beta
  project      = google_project.istanza.project_id
  account_id   = "deploy"
  display_name = "Deploy dal workflow"
}

resource "google_project_iam_member" "deploy" {
  provider = google-beta
  for_each = toset([
    "roles/firebase.admin",
    "roles/cloudfunctions.admin",
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/storage.admin",
  ])
  project = google_project.istanza.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Il service account di provisioning amministra il progetto nuovo: è lui
# che, dal workflow, pubblica regole, Functions e hosting e scrive la
# licenza (scripts/licenza-istanza.mjs). Chi crea il progetto
# nell'organizzazione ne è anche proprietario; senza organizzazione il
# ruolo di proprietario lo dà l'utente quando crea il progetto a mano.
# Crea anche l'account del titolare con l'uid della regia
# (scripts/titolare-istanza.mjs, M7): getUser, createUser con uid,
# setCustomUserClaims e, per un segnaposto mai usato, deleteUser. Bastano i
# permessi firebaseauth.users.* che roles/firebase.admin già comprende: non
# serve un ruolo in più.
resource "google_project_iam_member" "provisioning" {
  provider = google-beta
  for_each = var.provisioning_sa_email == "" ? toset([]) : toset([
    "roles/firebase.admin",
    "roles/cloudfunctions.admin",
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/storage.admin",
    "roles/datastore.user",
  ])
  project = google_project.istanza.project_id
  role    = each.value
  member  = "serviceAccount:${var.provisioning_sa_email}"
}

# Gli agenti di servizio che le Functions di Firestore usano (Eventarc
# porta l'evento, Pub/Sub lo consegna). Google li fa nascere solo al primo
# uso, e i loro permessi arrivano qualche minuto dopo: al primo deploy le
# Functions con un trigger di Firestore si fermavano con «Permission denied
# while using the Eventarc Service Agent» (prova-bar, 29/10/2026). Qui
# nascono con il progetto, minuti prima del deploy; il workflow riprova
# comunque il deploy se i permessi non sono ancora arrivati. Il profilo
# leggero non ha Functions, quindi nemmeno loro.
resource "google_project_service_identity" "agenti" {
  provider   = google-beta
  for_each   = local.completo ? toset(["eventarc.googleapis.com", "pubsub.googleapis.com"]) : toset([])
  project    = google_project.istanza.project_id
  service    = each.value
  depends_on = [google_project_service.api]
}

resource "google_project_iam_member" "agente_eventarc" {
  provider = google-beta
  count    = local.completo ? 1 : 0
  project  = google_project.istanza.project_id
  role     = "roles/eventarc.serviceAgent"
  member   = "serviceAccount:${google_project_service_identity.agenti["eventarc.googleapis.com"].email}"
}

resource "google_project_iam_member" "agente_pubsub" {
  provider = google-beta
  count    = local.completo ? 1 : 0
  project  = google_project.istanza.project_id
  role     = "roles/iam.serviceAccountTokenCreator"
  member   = "serviceAccount:${google_project_service_identity.agenti["pubsub.googleapis.com"].email}"
}

# I locali attivati prima del profilo (prova-bar) hanno nello stato i due
# permessi senza indice: si spostano, senza toglierli e rimetterli.
moved {
  from = google_project_iam_member.agente_eventarc
  to   = google_project_iam_member.agente_eventarc[0]
}

moved {
  from = google_project_iam_member.agente_pubsub
  to   = google_project_iam_member.agente_pubsub[0]
}

# La regia sospende e riattiva l'istanza scrivendo settings/bar.licenza
# (REQ-FLOTTA-008): le serve di leggere e scrivere Firestore qui.
resource "google_project_iam_member" "regia" {
  provider = google-beta
  project  = google_project.istanza.project_id
  role     = "roles/datastore.user"
  member   = "serviceAccount:${var.regia_sa_email}"
}

# IL PASSAGGIO FRA LA REGIA E L'APP (REQ-FLOTTA-030): la regia legge
# l'account del titolare nel locale (è lui, è admin?) e firma l'accesso
# COME l'account dell'SDK di Firebase del progetto, perché Firebase accetta
# solo accessi firmati da un account del suo progetto. Firmare non dà altri
# permessi: niente lettura né scrittura in più.
resource "google_project_iam_member" "regia_account" {
  provider = google-beta
  project  = google_project.istanza.project_id
  role     = "roles/firebaseauth.viewer"
  member   = "serviceAccount:${var.regia_sa_email}"
}

resource "google_service_account_iam_member" "regia_firma" {
  provider           = google-beta
  service_account_id = "projects/${google_project.istanza.project_id}/serviceAccounts/firebase-adminsdk-fbsvc@${google_project.istanza.project_id}.iam.gserviceaccount.com"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${var.regia_sa_email}"
  depends_on         = [google_firebase_project.firebase]
}

# L'ACCOUNT DELL'AI DEL LOCALE (REQ-FLOTTA-077): la Function AI dell'app
# gira con questo, e la regia la riconosce dal suo indirizzo, che porta il
# nome del progetto. Niente chiavi: il gettone lo firma Google. Gli serve
# quello che serve a una Function: Firestore e log del suo progetto. Il
# deploy lo può già usare (roles/iam.serviceAccountUser, sopra).
resource "google_service_account" "ai_locale" {
  provider     = google-beta
  project      = google_project.istanza.project_id
  account_id   = "ai-locale"
  display_name = "L'AI del locale verso la regia"
}

resource "google_project_iam_member" "ai_locale" {
  provider = google-beta
  for_each = toset([
    "roles/datastore.user",
    "roles/logging.logWriter",
  ])
  project = google_project.istanza.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.ai_locale.email}"
}

# Quello che il workflow mette nel .env della build (VITE_FIREBASE_*).
output "config_web" {
  value = {
    VITE_FIREBASE_API_KEY             = data.google_firebase_web_app_config.app.api_key
    VITE_FIREBASE_AUTH_DOMAIN         = data.google_firebase_web_app_config.app.auth_domain
    VITE_FIREBASE_PROJECT_ID          = google_project.istanza.project_id
    # Il nome che storage-istanza.mjs dà al bucket (lo decide Firebase).
    VITE_FIREBASE_STORAGE_BUCKET      = "${local.progetto}.firebasestorage.app"
    VITE_FIREBASE_MESSAGING_SENDER_ID = lookup(data.google_firebase_web_app_config.app, "messaging_sender_id", "")
    VITE_FIREBASE_APP_ID              = google_firebase_web_app.app.app_id
  }
  sensitive = true
}

output "deploy_service_account" {
  value = google_service_account.deploy.email
}

output "url" {
  value = "https://${google_firebase_hosting_site.sito.site_id}.web.app"
}
