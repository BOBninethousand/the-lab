#!/usr/bin/env python3
"""
Test script to validate The Lab backend setup.
Run this to verify all components are working correctly.
"""

import os
import sys
import json
from pathlib import Path

def check_python_version():
    """Check Python version >= 3.9"""
    version = sys.version_info
    if version.major >= 3 and version.minor >= 9:
        print("✓ Python version: OK (3.9+)")
        return True
    else:
        print(f"✗ Python version: FAILED (found {version.major}.{version.minor}, need 3.9+)")
        return False


def check_dependencies():
    """Check if all dependencies are installed"""
    required = [
        'fastapi',
        'uvicorn',
        'pydantic',
        'langchain',
        'apscheduler',
        'websockets',
    ]

    missing = []
    for dep in required:
        try:
            __import__(dep)
        except ImportError:
            missing.append(dep)

    if missing:
        print(f"✗ Dependencies: MISSING - {', '.join(missing)}")
        print("  Run: pip install -r requirements.txt")
        return False
    else:
        print("✓ Dependencies: OK")
        return True


def check_env_file():
    """Check if .env file exists"""
    if os.path.exists('.env'):
        print("✓ .env file: EXISTS")
        return True
    else:
        print("✗ .env file: MISSING")
        print("  Run: cp .env.example .env")
        return False


def check_env_keys():
    """Check if required env keys are configured"""
    if not os.path.exists('.env'):
        return False

    with open('.env', 'r') as f:
        content = f.read()

    has_openai = 'OPENAI_API_KEY=' in content and len(content.split('OPENAI_API_KEY=')[1].split('\n')[0].strip()) > 0
    has_anthropic = 'ANTHROPIC_API_KEY=' in content and len(content.split('ANTHROPIC_API_KEY=')[1].split('\n')[0].strip()) > 0

    if not has_openai and not has_anthropic:
        print("⚠ API Keys: MISSING")
        print("  At least one API key required:")
        print("  - OPENAI_API_KEY=sk-...")
        print("  - ANTHROPIC_API_KEY=sk-ant-...")
        return False
    elif not has_openai:
        print("⚠ API Keys: PARTIAL (missing OPENAI_API_KEY)")
        return True
    elif not has_anthropic:
        print("⚠ API Keys: PARTIAL (missing ANTHROPIC_API_KEY)")
        return True
    else:
        print("✓ API Keys: CONFIGURED")
        return True


def check_app_structure():
    """Check if all required app files exist"""
    required_files = [
        'app/__init__.py',
        'app/config.py',
        'app/models.py',
        'app/main.py',
        'app/agents.py',
        'app/memory.py',
        'app/documents.py',
        'app/scheduler.py',
        'app/crew_manager.py',
        'app/websocket_manager.py',
    ]

    missing = []
    for filepath in required_files:
        if not os.path.exists(filepath):
            missing.append(filepath)

    if missing:
        print(f"✗ App structure: MISSING FILES - {', '.join(missing)}")
        return False
    else:
        print("✓ App structure: OK")
        return True


def check_imports():
    """Check if all modules can be imported"""
    try:
        from app.config import settings
        from app.models import Agent, Task, Crew
        from app.agents import AgentManager
        from app.memory import MemoryManager
        from app.documents import DocumentManager
        from app.scheduler import SchedulerManager
        from app.crew_manager import CrewManager
        from app.websocket_manager import ws_manager
        print("✓ Module imports: OK")
        return True
    except Exception as e:
        print(f"✗ Module imports: FAILED - {str(e)}")
        return False


def check_data_directory():
    """Check if data directory can be created"""
    try:
        os.makedirs('data', exist_ok=True)
        os.makedirs('data/memories', exist_ok=True)
        os.makedirs('data/journals', exist_ok=True)
        os.makedirs('data/documents', exist_ok=True)
        os.makedirs('data/chats', exist_ok=True)
        os.makedirs('data/crew_logs', exist_ok=True)
        print("✓ Data directory: OK")
        return True
    except Exception as e:
        print(f"✗ Data directory: FAILED - {str(e)}")
        return False


def check_agent_manager():
    """Check if AgentManager initializes correctly"""
    try:
        from app.agents import AgentManager
        manager = AgentManager()
        agents = manager.list_agents()
        if len(agents) == 4:
            agent_names = [a.name for a in agents]
            expected = ['Scout', 'Quill', 'Forge', 'Radar']
            if all(name in agent_names for name in expected):
                print(f"✓ AgentManager: OK ({len(agents)} default agents)")
                return True
        print(f"✗ AgentManager: FAILED (expected 4 agents, found {len(agents)})")
        return False
    except Exception as e:
        print(f"✗ AgentManager: FAILED - {str(e)}")
        return False


def check_fastapi():
    """Check if FastAPI app can be created"""
    try:
        from app.main import app
        print("✓ FastAPI app: OK")
        return True
    except Exception as e:
        print(f"✗ FastAPI app: FAILED - {str(e)}")
        return False


def main():
    """Run all checks"""
    print("\nThe Lab - Setup Validation")
    print("=" * 50)

    checks = [
        check_python_version,
        check_dependencies,
        check_app_structure,
        check_env_file,
        check_env_keys,
        check_data_directory,
        check_imports,
        check_agent_manager,
        check_fastapi,
    ]

    results = []
    for check in checks:
        try:
            results.append(check())
        except Exception as e:
            print(f"✗ {check.__name__}: EXCEPTION - {str(e)}")
            results.append(False)

    print("=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"\nResults: {passed}/{total} checks passed")

    if all(results):
        print("\n✓ Setup is ready! Start the server:")
        print("  uvicorn app.main:app --reload")
        return 0
    else:
        print("\n✗ Setup has issues. Fix the errors above and try again.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
