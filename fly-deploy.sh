#!/bin/bash
# ==============================================================================
# Dispotree - Fly.io Deployment Script
# ==============================================================================
# Usage:
#   ./fly-deploy.sh setup     - First-time setup (create apps, database, redis)
#   ./fly-deploy.sh backend   - Deploy backend only
#   ./fly-deploy.sh frontend  - Deploy frontend only
#   ./fly-deploy.sh all       - Deploy both services
#   ./fly-deploy.sh secrets   - Set secrets interactively
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKEND_APP="dispotree-api"
FRONTEND_APP="dispotree-web"
REGION="dfw"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_fly_cli() {
    if ! command -v fly &> /dev/null; then
        log_error "Fly CLI not found. Install it with: curl -L https://fly.io/install.sh | sh"
        exit 1
    fi
}

setup() {
    log_info "Setting up Fly.io applications..."

    # Create backend app
    log_info "Creating backend app: $BACKEND_APP"
    cd backend
    fly apps create $BACKEND_APP --org personal 2>/dev/null || log_warn "Backend app may already exist"

    # Create volume for uploads
    log_info "Creating volume for persistent data..."
    fly volumes create dispotree_data --region $REGION --size 1 --app $BACKEND_APP 2>/dev/null || log_warn "Volume may already exist"
    cd ..

    # Create frontend app
    log_info "Creating frontend app: $FRONTEND_APP"
    cd frontend
    fly apps create $FRONTEND_APP --org personal 2>/dev/null || log_warn "Frontend app may already exist"
    cd ..

    # Create PostgreSQL database
    log_info "Creating PostgreSQL database..."
    fly postgres create --name dispotree-db --region $REGION --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1 2>/dev/null || log_warn "Database may already exist"

    # Attach database to backend
    log_info "Attaching database to backend..."
    fly postgres attach dispotree-db --app $BACKEND_APP 2>/dev/null || log_warn "Database may already be attached"

    # Create Redis
    log_info "Creating Redis instance..."
    fly redis create --name dispotree-redis --region $REGION --no-replicas 2>/dev/null || log_warn "Redis may already exist"

    log_info "Setup complete!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Set your secrets: ./fly-deploy.sh secrets"
    log_info "2. Deploy: ./fly-deploy.sh all"
}

set_secrets() {
    log_info "Setting secrets for $BACKEND_APP..."
    log_info "You'll be prompted to enter values (press Enter to skip optional ones)"

    read -p "JWT_SECRET (required): " JWT_SECRET
    read -p "OPENAI_API_KEY (for AI features): " OPENAI_API_KEY
    read -p "OPENROUTER_API_KEY (alternative LLM): " OPENROUTER_API_KEY
    read -p "PINECONE_API_KEY (for RAG): " PINECONE_API_KEY
    read -p "RAPIDAPI_KEY (for Zillow data): " RAPIDAPI_KEY
    read -p "DOCUSEAL_API_KEY (for e-signatures): " DOCUSEAL_API_KEY
    read -p "DOCUSEAL_WEBHOOK_SECRET: " DOCUSEAL_WEBHOOK_SECRET
    read -p "TWILIO_ACCOUNT_SID (for voice): " TWILIO_ACCOUNT_SID
    read -p "TWILIO_AUTH_TOKEN: " TWILIO_AUTH_TOKEN
    read -p "TWILIO_NUMBER: " TWILIO_NUMBER
    read -p "RESEND_API_KEY (for email): " RESEND_API_KEY
    read -p "STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
    read -p "STRIPE_WEBHOOK_SECRET: " STRIPE_WEBHOOK_SECRET

    SECRETS=""
    [ -n "$JWT_SECRET" ] && SECRETS="$SECRETS JWT_SECRET=$JWT_SECRET"
    [ -n "$OPENAI_API_KEY" ] && SECRETS="$SECRETS OPENAI_API_KEY=$OPENAI_API_KEY"
    [ -n "$OPENROUTER_API_KEY" ] && SECRETS="$SECRETS OPENROUTER_API_KEY=$OPENROUTER_API_KEY"
    [ -n "$PINECONE_API_KEY" ] && SECRETS="$SECRETS PINECONE_API_KEY=$PINECONE_API_KEY"
    [ -n "$RAPIDAPI_KEY" ] && SECRETS="$SECRETS RAPIDAPI_KEY=$RAPIDAPI_KEY"
    [ -n "$DOCUSEAL_API_KEY" ] && SECRETS="$SECRETS DOCUSEAL_API_KEY=$DOCUSEAL_API_KEY"
    [ -n "$DOCUSEAL_WEBHOOK_SECRET" ] && SECRETS="$SECRETS DOCUSEAL_WEBHOOK_SECRET=$DOCUSEAL_WEBHOOK_SECRET"
    [ -n "$TWILIO_ACCOUNT_SID" ] && SECRETS="$SECRETS TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID"
    [ -n "$TWILIO_AUTH_TOKEN" ] && SECRETS="$SECRETS TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN"
    [ -n "$TWILIO_NUMBER" ] && SECRETS="$SECRETS TWILIO_NUMBER=$TWILIO_NUMBER"
    [ -n "$RESEND_API_KEY" ] && SECRETS="$SECRETS RESEND_API_KEY=$RESEND_API_KEY"
    [ -n "$STRIPE_SECRET_KEY" ] && SECRETS="$SECRETS STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY"
    [ -n "$STRIPE_WEBHOOK_SECRET" ] && SECRETS="$SECRETS STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET"

    if [ -n "$SECRETS" ]; then
        fly secrets set $SECRETS --app $BACKEND_APP
        log_info "Secrets set successfully!"
    else
        log_warn "No secrets provided"
    fi

    # Frontend secrets
    log_info ""
    log_info "Setting frontend secrets..."
    read -p "NEXT_PUBLIC_SUPABASE_URL: " SUPABASE_URL
    read -p "NEXT_PUBLIC_SUPABASE_ANON_KEY: " SUPABASE_KEY
    read -p "NEXT_PUBLIC_GOOGLE_MAPS_KEY: " GOOGLE_MAPS_KEY
    read -p "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: " STRIPE_PK

    FRONTEND_SECRETS=""
    [ -n "$SUPABASE_URL" ] && FRONTEND_SECRETS="$FRONTEND_SECRETS NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
    [ -n "$SUPABASE_KEY" ] && FRONTEND_SECRETS="$FRONTEND_SECRETS NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY"
    [ -n "$GOOGLE_MAPS_KEY" ] && FRONTEND_SECRETS="$FRONTEND_SECRETS NEXT_PUBLIC_GOOGLE_MAPS_KEY=$GOOGLE_MAPS_KEY"
    [ -n "$STRIPE_PK" ] && FRONTEND_SECRETS="$FRONTEND_SECRETS NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK"

    if [ -n "$FRONTEND_SECRETS" ]; then
        fly secrets set $FRONTEND_SECRETS --app $FRONTEND_APP
        log_info "Frontend secrets set successfully!"
    fi
}

deploy_backend() {
    log_info "Deploying backend..."
    cd backend
    fly deploy --app $BACKEND_APP
    cd ..
    log_info "Backend deployed: https://$BACKEND_APP.fly.dev"
}

deploy_frontend() {
    log_info "Deploying frontend..."
    cd frontend
    fly deploy --app $FRONTEND_APP --build-arg NEXT_PUBLIC_API_URL=https://$BACKEND_APP.fly.dev
    cd ..
    log_info "Frontend deployed: https://$FRONTEND_APP.fly.dev"
}

deploy_all() {
    deploy_backend
    deploy_frontend
    log_info ""
    log_info "Deployment complete!"
    log_info "Backend: https://$BACKEND_APP.fly.dev"
    log_info "Frontend: https://$FRONTEND_APP.fly.dev"
    log_info "API Docs: https://$BACKEND_APP.fly.dev/api-docs"
}

# Main
check_fly_cli

case "$1" in
    setup)
        setup
        ;;
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_all
        ;;
    secrets)
        set_secrets
        ;;
    *)
        echo "Dispotree Fly.io Deployment"
        echo ""
        echo "Usage: $0 {setup|backend|frontend|all|secrets}"
        echo ""
        echo "Commands:"
        echo "  setup     - First-time setup (create apps, database, redis)"
        echo "  backend   - Deploy backend only"
        echo "  frontend  - Deploy frontend only"
        echo "  all       - Deploy both services"
        echo "  secrets   - Set environment secrets"
        exit 1
        ;;
esac
