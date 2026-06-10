#!/usr/bin/env python3
"""Seed test cases for ALL problems.

This script tries to extract test cases from the frontend problem JSON files 
and seeds them into the database. Falls back to generic test cases if frontend 
files are not accessible.

Run:
    python scripts/seed_testcases.py
"""
import json
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings
from app.problems.models.problem import Problem, ProblemTestCase

# Create DB connection
settings = get_settings()
engine = create_engine(str(settings.DATABASE_URL))
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def extract_testcases_from_problem(problem_data):
    """Extract test cases from problem JSON data."""
    testcases = []
    
    # Try different field names for examples
    examples = problem_data.get("examples", [])
    
    for example in examples:
        if isinstance(example, dict):
            input_val = example.get("input") or example.get("input_data") or example.get("in")
            output_val = example.get("output") or example.get("output_data") or example.get("out")
            
            if input_val is not None and output_val is not None:
                testcases.append({
                    "input": str(input_val),
                    "output": str(output_val),
                })
    
    return testcases

def seed_testcases_from_frontend():
    """Scan frontend problem files and seed test cases."""
    try:
        # Try multiple possible paths
        possible_paths = [
            Path("/app/../frontend/public/problems"),
            Path("/frontend/public/problems"),
            Path("../frontend/public/problems"),
            Path("/workspace/frontend/public/problems"),
        ]
        
        problems_dir = None
        for path in possible_paths:
            if path.exists():
                problems_dir = path
                break
        
        if not problems_dir:
            print(f"⚠ Problems directory not found in any of the expected locations")
            return False
        
        print(f"📂 Scanning {problems_dir} for problem files...")
        
        # Get all JSON files from subdirectories
        problem_files = list(problems_dir.glob("*/*.json")) + list(problems_dir.glob("*.json"))
        print(f"📝 Found {len(problem_files)} problem files")
        
        seeded_count = 0
        skipped_count = 0
        
        for problem_file in problem_files:
            try:
                with open(problem_file, 'r', encoding='utf-8') as f:
                    problem_data = json.load(f)
                
                problem_title = problem_data.get("title")
                problem_slug = problem_data.get("slug")
                
                if not problem_title:
                    continue
                
                # Find problem in database
                problem = None
                if problem_slug:
                    problem = db.query(Problem).filter(
                        Problem.slug == problem_slug
                    ).first()
                
                if not problem:
                    problem = db.query(Problem).filter(
                        Problem.title == problem_title
                    ).first()
                
                if not problem:
                    skipped_count += 1
                    continue
                
                # Extract test cases
                testcases = extract_testcases_from_problem(problem_data)
                
                if not testcases:
                    skipped_count += 1
                    continue
                
                # Clear existing test cases
                db.query(ProblemTestCase).filter(
                    ProblemTestCase.problem_id == problem.id
                ).delete()
                
                # Add new test cases
                for tc in testcases:
                    test_case = ProblemTestCase(
                        problem_id=problem.id,
                        input=tc["input"],
                        expected_output=tc["output"],
                        is_hidden=False,
                    )
                    db.add(test_case)
                
                db.commit()
                seeded_count += 1
                
                if seeded_count % 50 == 0:
                    print(f"✓ Seeded {seeded_count} problems...")
            
            except json.JSONDecodeError:
                skipped_count += 1
                continue
            except Exception as e:
                db.rollback()
                print(f"⚠ Error processing {problem_file}: {e}")
                skipped_count += 1
                continue
        
        print(f"\n✓ Seeding from frontend complete!")
        print(f"  - Seeded: {seeded_count} problems")
        print(f"  - Skipped: {skipped_count} (no test cases or not in DB)")
        return True
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def seed_generic_testcases():
    """Add generic test case to all problems without test cases."""
    try:
        print("\n📋 Adding generic test cases to problems without test cases...")
        
        # Find all problems
        all_problems = db.query(Problem).all()
        count_without_tests = 0
        count_added = 0
        
        for problem in all_problems:
            # Check if this problem has test cases
            has_tests = db.query(ProblemTestCase).filter(
                ProblemTestCase.problem_id == problem.id
            ).first() is not None
            
            if not has_tests:
                count_without_tests += 1
                # Add a generic placeholder test case
                test_case = ProblemTestCase(
                    problem_id=problem.id,
                    input="",
                    expected_output="",
                    is_hidden=False,
                )
                db.add(test_case)
                count_added += 1
                
                if count_added % 50 == 0:
                    db.commit()
                    print(f"  ✓ Added generic test cases to {count_added} problems...")
        
        db.commit()
        print(f"\n✓ Generic seeding complete!")
        print(f"  - Problems without test cases: {count_without_tests}")
        print(f"  - Generic test cases added: {count_added}")
        return True
    
    except Exception as e:
        db.rollback()
        print(f"Error during generic seeding: {e}")
        import traceback
        traceback.print_exc()
        return False

try:
    print("🚀 Starting comprehensive test case seeding...\n")
    
    frontend_success = seed_testcases_from_frontend()
    
    if not frontend_success:
        print("\n⚠ Frontend seeding failed. Falling back to generic test cases...\n")
    
    seed_generic_testcases()
    
    print("\n✅ All done!")

except Exception as e:
    db.rollback()
    print(f"Fatal error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
