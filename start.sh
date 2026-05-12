#!/bin/bash
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

clear
echo -e "${CYAN}  Marketplace R45 — Arbitraje Inteligente${NC}"
echo "  ========================================"

# Verificar Python
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}[ERROR] Python3 no está instalado.${NC}"
    exit 1
fi

# Instalar dependencias
echo -e "${YELLOW}[1/2] Instalando dependencias...${NC}"
cd "$SCRIPT_DIR/backend"
pip3 install -r requirements.txt --quiet

# Verificar .env
echo -e "${YELLOW}[2/2] Verificando .env...${NC}"
if [ ! -f ".env" ]; then
    [ -f ".env.example" ] && cp .env.example .env
    echo -e "${RED}Completá backend/.env y volvé a ejecutar.${NC}"
    exit 1
fi

# Abrir navegador
(sleep 3 && (xdg-open "http://localhost:8000" 2>/dev/null || open "http://localhost:8000")) &

echo ""
echo "  ========================================"
echo -e "  ${GREEN}Frontend + API:${NC} http://localhost:8000"
echo -e "  ${GREEN}Docs:${NC}          http://localhost:8000/docs"
echo "  ========================================"
echo -e "  ${YELLOW}[Ctrl+C para detener]${NC}"
echo ""

cd "$SCRIPT_DIR/backend/api"
python3 -m uvicorn api:app --reload --port 8000
