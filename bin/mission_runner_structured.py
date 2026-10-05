#!/usr/bin/env python3
import json
import subprocess
import sys
import os
import yaml
import re
from pathlib import Path

def strip_ansi(text):
    """Remove ANSI escape sequences from text."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def get_state_path(mission_id, workspace):
    """Return the path to the state file for a mission."""
    state_dir = Path(workspace) / '.mission_state'
    state_dir.mkdir(parents=True, exist_ok=True)
    return state_dir / f"{mission_id}.json"

def load_state(mission_id, workspace):
    """Load state from file if exists."""
    state_path = get_state_path(mission_id, workspace)
    if state_path.exists():
        with open(state_path, 'r') as f:
            return json.load(f)
    return None

def save_state(state, mission_id, workspace):
    """Save state to file."""
    state_path = get_state_path(mission_id, workspace)
    with open(state_path, 'w') as f:
        json.dump(state, f, indent=2)

def get_virtualenv_python(workspace):
    """Return the path to the virtual environment python if exists, else None."""
    venv_paths = [
        Path(workspace) / 'venv' / 'bin' / 'python',
        Path(workspace) / '.venv' / 'bin' / 'python'
    ]
    for path in venv_paths:
        if path.exists():
            return str(path)
    return None

def run_mission(mission_dict, workspace='.'):
    """Run a mission given as a dictionary and return the result dictionary."""
    mission_id = mission_dict.get('mission_id')
    goal = mission_dict.get('goal')
    deliverable = mission_dict.get('deliverable')
    constraints = mission_dict.get('constraints', [])
    
    # Change to workspace
    original_dir = os.getcwd()
    os.chdir(workspace)
    
    # We don't support continuation via this function; it's for new missions only.
    # Load state if exists (should not exist for a new mission)
    mission_state = load_state(mission_id, workspace)
    if mission_state is not None:
        # State exists, we cannot run a new mission without continuation mode.
        # But for the web endpoint, we are treating each mission as new, so we should fail.
        os.chdir(original_dir)
        return {
            "mission_id": mission_id,
            "state": "FAIL",
            "summary": f"state already exists for mission_id {mission_id}. Use continuation mode to continue.",
            "modified_files": [],
            "tests": {"ran": False},
            "errors": [f"state already exists for mission_id {mission_id}"],
            "next_action": "Use a different mission_id or continuation mode"
        }
    
    # Create initial state
    mission_state = {
        "mission_id": mission_id,
        "goal": goal,
        "workspace": workspace,
        "deliverable": deliverable,
        "constraints": constraints,
        "history": []
    }
    
    # Record initial git status for this run
    initial_status = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
    
    # Build the prompt for OpenCode
    prompt_parts = []
    prompt_parts.append(f"Mission ID: {mission_state['mission_id']}")
    prompt_parts.append(f"Goal: {mission_state['goal']}")
    prompt_parts.append(f"Deliverable: {mission_state['deliverable']}")
    prompt_parts.append(f"Constraints: {', '.join(mission_state['constraints'])}")
    prompt_parts.append("---")
    if mission_state['history']:
        prompt_parts.append("History of previous iterations:")
        for i, hist in enumerate(mission_state['history']):
            prompt_parts.append(f"Iteration {i+1}:")
            prompt_parts.append(f"Instruction: {hist['instruction']}")
            prompt_parts.append(f"Result: {json.dumps(hist['result'], indent=2)}")
    prompt_parts.append("---")
    prompt_parts.append("Please execute the mission to achieve the goal.")
    
    prompt = "\n".join(prompt_parts)
    
    # Prepare opencode command
    cmd = [
        'opencode', 'run',
        '--model', 'freellmapi/nemotron-3-super-120b',
        prompt
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        os.chdir(original_dir)
        return {
            "mission_id": mission_id,
            "state": "BLOCKED",
            "summary": "OpenCode execution timed out",
            "modified_files": [],
            "tests": {"ran": False},
            "errors": ["OpenCode execution timed out"],
            "next_action": "Check dependencies or simplify mission"
        }
    finally:
        os.chdir(original_dir)
    
    # Change back to workspace to run git commands
    os.chdir(workspace)
    
    # Get git diff and status after this run
    git_status_after = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
    git_diff = subprocess.run(['git', 'diff', '--name-only'], capture_output=True, text=True)
    modified_files = [f.strip() for f in git_diff.stdout.splitlines() if f.strip()]
    
    # Run tests if there are test files
    tests_ran = False
    tests_passed = 0
    tests_failed = 0
    tests_errors = 0
    test_output = ""
    # Look for test files in the workspace
    test_files = list(Path('.').rglob('test_*.py'))
    if test_files:
        tests_ran = True
        # Use virtual environment python if available
        venv_python = get_virtualenv_python(workspace)
        if venv_python:
            pytest_cmd = [venv_python, '-m', 'pytest', '-q']
        else:
            pytest_cmd = ['pytest', '-q']
        # Set PYTHONPATH to current directory
        env = os.environ.copy()
        env['PYTHONPATH'] = '.'
        pytest_result = subprocess.run(pytest_cmd, capture_output=True, text=True, env=env)
        test_output = pytest_result.stdout + pytest_result.stderr
        # Parse pytest output for passed/failed/errors
        passed_match = re.search(r'(\d+)\s+passed', test_output)
        failed_match = re.search(r'(\d+)\s+failed', test_output)
        error_match = re.search(r'(\d+)\s+error', test_output)
        if passed_match:
            tests_passed = int(passed_match.group(1))
        if failed_match:
            tests_failed = int(failed_match.group(1))
        if error_match:
            tests_errors = int(error_match.group(1))
    
    # Extract summary and errors from OpenCode output
    output = result.stdout + result.stderr
    output_stripped = strip_ansi(output)
    lines = output_stripped.splitlines()
    
    # Look for summary: try to find the deliverable or goal in the output
    summary_line = ""
    if deliverable:
        for line in lines:
            if deliverable.lower() in line.lower():
                summary_line = line.strip()
                break
    if not summary_line and goal:
        for line in lines:
            if goal.lower() in line.lower():
                summary_line = line.strip()
                break
    if not summary_line:
        # Look for resultado: or entregable:
        for line in lines:
            line_lower = line.lower()
            if 'resultado:' in line_lower or 'entregable:' in line_lower:
                summary_line = line.strip()
                break
    if not summary_line:
        # Take the last 5 non-empty lines
        non_empty = [line.strip() for line in lines if line.strip()]
        summary_line = ' '.join(non_empty[-5:]) if len(non_empty) >= 5 else ' '.join(non_empty)
    
    summary = summary_line
    
    # Errors: only stderr if it contains error/exception, and lines from output that contain error/exception
    errors = []
    # Check stderr
    if result.stderr:
        stderr_stripped = strip_ansi(result.stderr.strip())
        if stderr_stripped and any(keyword in stderr_stripped.lower() for keyword in ['error', 'exception']):
            errors.append(stderr_stripped)
    # Check output lines
    for line in lines:
        line_stripped = strip_ansi(line)
        if any(keyword in line_stripped.lower() for keyword in ['error', 'exception']):
            errors.append(line_stripped)
    # Deduplicate errors
    errors = list(dict.fromkeys(errors))
    
    # Determine state
    run_state = "FAIL" if result.returncode != 0 else "PASS"
    if tests_ran and (tests_failed > 0 or tests_errors > 0):
        run_state = "FAIL"
    
    # Next action: for now, we'll set a placeholder
    next_action = "Awaiting next instruction"
    
    # Build the result dictionary
    result_dict = {
        "mission_id": mission_id,
        "state": run_state,
        "summary": summary,
        "modified_files": modified_files,
        "tests": {
            "ran": tests_ran,
            "passed": tests_passed,
            "failed": tests_failed,
            "errors": tests_errors,
            "output": strip_ansi(test_output) if test_output else ""
        },
        "errors": errors,
        "next_action": next_action
    }
    
    # Update state with this run's history
    # The instruction is the original mission content (we don't have the raw YAML, but we can reconstruct?)
    # For simplicity, we'll store the mission_dict as the instruction.
    mission_state['history'].append({
        "instruction": mission_dict,  # Store the dict as instruction for now
        "result": result_dict
    })
    
    # Save state
    save_state(mission_state, mission_id, workspace)
    
    # Change back to original directory
    os.chdir(original_dir)
    
    return result_dict

def main():
    # Determine if we are in continuation mode
    continuation = False
    instruction = None
    if len(sys.argv) >= 3:
        # Assume second argument is the instruction for continuation
        continuation = True
        instruction = sys.argv[2]
    elif len(sys.argv) < 2:
        print(json.dumps({"error": "missing mission file"}), file=sys.stderr)
        sys.exit(1)
    
    mission_file = sys.argv[1]
    if not os.path.exists(mission_file):
        print(json.dumps({"error": f"mission file not found: {mission_file}"}), file=sys.stderr)
        sys.exit(1)
    
    # Load mission YAML
    with open(mission_file, 'r') as f:
        mission = yaml.safe_load(f)
    
    # If continuation mode, we need to load the state and update with the new instruction
    if continuation:
        mission_id = mission.get('mission_id')
        workspace = mission.get('workspace', '.')
        mission_state = load_state(mission_id, workspace)
        if mission_state is None:
            print(json.dumps({
                "error": f"no state found for mission_id {mission_id}. Cannot continuation without initial state."
            }), file=sys.stderr)
            sys.exit(1)
        # Update state with continuation
        # We don't modify the mission state's goal, etc., just add to history
        mission_state['history'].append({
            "instruction": instruction,
            "result": None  # Placeholder, will be filled after running
        })
        # For continuation, we run the mission with the same state but we need to build the prompt with history.
        # We'll reuse the same logic as in run_mission but with continuation.
        # However, to avoid duplication, we'll run the mission by calling the same steps as in the original main.
        # Let's extract the continuation logic.
        
        # We'll set up the mission_state for continuation
        goal = mission_state.get('goal')
        deliverable = mission_state.get('deliverable')
        constraints = mission_state.get('constraints', [])
        workspace = mission_state.get('workspace', '.')
        
        # Change to workspace
        original_dir = os.getcwd()
        os.chdir(workspace)
        
        # Record initial git status for this run
        initial_status = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
        
        # Build the prompt for OpenCode
        prompt_parts = []
        prompt_parts.append(f"Mission ID: {mission_state['mission_id']}")
        prompt_parts.append(f"Goal: {mission_state['goal']}")
        prompt_parts.append(f"Deliverable: {mission_state['deliverable']}")
        prompt_parts.append(f"Constraints: {', '.join(mission_state['constraints'])}")
        prompt_parts.append("---")
        if mission_state['history']:
            # Exclude the last history entry (the one we just added with placeholder result)
            for i, hist in enumerate(mission_state['history'][:-1]):
                prompt_parts.append(f"Iteration {i+1}:")
                prompt_parts.append(f"Instruction: {hist['instruction']}")
                prompt_parts.append(f"Result: {json.dumps(hist['result'], indent=2)}")
        prompt_parts.append("---")
        prompt_parts.append(f"New instruction: {instruction}")
        prompt_parts.append("Please continue the mission based on the new instruction and the previous results.")
        
        prompt = "\n".join(prompt_parts)
        
        # Prepare opencode command
        cmd = [
            'opencode', 'run',
            '--model', 'freellmapi/nemotron-3-super-120b',
            prompt
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            print(json.dumps({
                "mission_id": mission_id,
                "state": "BLOCKED",
                "summary": "OpenCode execution timed out",
                "modified_files": [],
                "tests": {"ran": False},
                "errors": ["OpenCode execution timed out"],
                "next_action": "Check dependencies or simplify mission"
            }))
            os.chdir(original_dir)
            return
        finally:
            os.chdir(original_dir)
        
        # Change back to workspace to run git commands
        os.chdir(workspace)
        
        # Get git diff and status after this run
        git_status_after = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
        git_diff = subprocess.run(['git', 'diff', '--name-only'], capture_output=True, text=True)
        modified_files = [f.strip() for f in git_diff.stdout.splitlines() if f.strip()]
        
        # Run tests if there are test files
        tests_ran = False
        tests_passed = 0
        tests_failed = 0
        tests_errors = 0
        test_output = ""
        # Look for test files in the workspace
        test_files = list(Path('.').rglob('test_*.py'))
        if test_files:
            tests_ran = True
            # Use virtual environment python if available
            venv_python = get_virtualenv_python(workspace)
            if venv_python:
                pytest_cmd = [venv_python, '-m', 'pytest', '-q']
            else:
                pytest_cmd = ['pytest', '-q']
            # Set PYTHONPATH to current directory
            env = os.environ.copy()
            env['PYTHONPATH'] = '.'
            pytest_result = subprocess.run(pytest_cmd, capture_output=True, text=True, env=env)
            test_output = pytest_result.stdout + pytest_result.stderr
            # Parse pytest output for passed/failed/errors
            passed_match = re.search(r'(\d+)\s+passed', test_output)
            failed_match = re.search(r'(\d+)\s+failed', test_output)
            error_match = re.search(r'(\d+)\s+error', test_output)
            if passed_match:
                tests_passed = int(passed_match.group(1))
            if failed_match:
                tests_failed = int(failed_match.group(1))
            if error_match:
                tests_errors = int(error_match.group(1))
        
        # Extract summary and errors from OpenCode output
        output = result.stdout + result.stderr
        output_stripped = strip_ansi(output)
        lines = output_stripped.splitlines()
        
        # Look for summary: try to find the deliverable or goal in the output
        summary_line = ""
        if deliverable:
            for line in lines:
                if deliverable.lower() in line.lower():
                    summary_line = line.strip()
                    break
        if not summary_line and goal:
            for line in lines:
                if goal.lower() in line.lower():
                    summary_line = line.strip()
                    break
        if not summary_line:
            # Look for resultado: or entregable:
            for line in lines:
                line_lower = line.lower()
                if 'resultado:' in line_lower or 'entregable:' in line_lower:
                    summary_line = line.strip()
                    break
        if not summary_line:
            # Take the last 5 non-empty lines
            non_empty = [line.strip() for line in lines if line.strip()]
            summary_line = ' '.join(non_empty[-5:]) if len(non_empty) >= 5 else ' '.join(non_empty)
        
        summary = summary_line
        
        # Errors: only stderr if it contains error/exception, and lines from output that contain error/exception
        errors = []
        # Check stderr
        if result.stderr:
            stderr_stripped = strip_ansi(result.stderr.strip())
            if stderr_stripped and any(keyword in stderr_stripped.lower() for keyword in ['error', 'exception']):
                errors.append(stderr_stripped)
        # Check output lines
        for line in lines:
            line_stripped = strip_ansi(line)
            if any(keyword in line_stripped.lower() for keyword in ['error', 'exception']):
                errors.append(line_stripped)
        # Deduplicate errors
        errors = list(dict.fromkeys(errors))
        
        # Determine state
        run_state = "FAIL" if result.returncode != 0 else "PASS"
        if tests_ran and (tests_failed > 0 or tests_errors > 0):
            run_state = "FAIL"
        
        # Next action: for now, we'll set a placeholder
        next_action = "Awaiting next instruction"
        
        # Build the result dictionary
        result_dict = {
            "mission_id": mission_id,
            "state": run_state,
            "summary": summary,
            "modified_files": modified_files,
            "tests": {
                "ran": tests_ran,
                "passed": tests_passed,
                "failed": tests_failed,
                "errors": tests_errors,
                "output": strip_ansi(test_output) if test_output else ""
            },
            "errors": errors,
            "next_action": next_action
        }
        
        # Update state with this run's history (replace the placeholder)
        mission_state['history'][-1]["result"] = result_dict
        
        # Save state
        save_state(mission_state, mission_id, workspace)
        
        # Change back to original directory
        os.chdir(original_dir)
        
        # Output JSON to stdout
        print(json.dumps(result_dict, indent=2))
        return
    
    # Not continuation mode
    mission_id = mission.get('mission_id')
    goal = mission.get('goal')
    workspace = mission.get('workspace', '.')
    deliverable = mission.get('deliverable')
    constraints = mission.get('constraints', [])
    
    # Run the mission using the common function
    result_dict = run_mission(mission, workspace)
    
    # Output JSON to stdout
    print(json.dumps(result_dict, indent=2))

if __name__ == '__main__':
    main()