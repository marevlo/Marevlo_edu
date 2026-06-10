"""mira_seed_demo_content.py — Generate demo course content for MIRA pilot.

Use this when real Marevlo courses aren't ingested yet. Creates:
  - 1 concept lattice for course "ml-fundamentals"
  - ~40 embedding chunks in Qdrant covering core ML topics
  - Sample rubric for the course

This lets the 6-tester pilot have real content to interact with before
your production courses are added.

Run:
    python -m app.scripts.mira_seed_demo_content

The content is synthesized from general ML knowledge (not copyrighted),
so testers get a realistic tutoring experience. When your real courses
are ready, run mira_ingest_courses.py instead.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger("mira.seed_demo")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# =============================================================================
# DEMO CONTENT (curated, non-copyrighted ML basics)
# =============================================================================
@dataclass
class DemoChunk:
    module_id: str
    section_id: str
    chunk_index: int
    chunk_type: str  # prose | example | formula
    concept_ids: list[str]
    heading_trail: list[str]
    text: str
    difficulty: float = 0.5


# Concept lattice for ML Fundamentals
DEMO_LATTICE = {
    "concepts": {
        "mean": {
            "id": "mean",
            "name": "Mean (average)",
            "description": "Arithmetic average of a set of values.",
            "prerequisites": [],
            "keywords": ["mean", "average", "expected value"],
            "difficulty": 0.2,
        },
        "variance": {
            "id": "variance",
            "name": "Variance",
            "description": "Measure of spread around the mean.",
            "prerequisites": ["mean"],
            "keywords": ["variance", "spread", "deviation"],
            "difficulty": 0.3,
        },
        "normal-distribution": {
            "id": "normal-distribution",
            "name": "Normal distribution",
            "description": "Bell-shaped probability distribution defined by mean and variance.",
            "prerequisites": ["mean", "variance"],
            "keywords": ["gaussian", "normal", "bell curve"],
            "difficulty": 0.4,
        },
        "supervised-learning": {
            "id": "supervised-learning",
            "name": "Supervised learning",
            "description": "Learning a function from labeled input-output pairs.",
            "prerequisites": [],
            "keywords": ["supervised", "labels", "training data"],
            "difficulty": 0.3,
        },
        "unsupervised-learning": {
            "id": "unsupervised-learning",
            "name": "Unsupervised learning",
            "description": "Finding structure in unlabeled data.",
            "prerequisites": [],
            "keywords": ["unsupervised", "clustering", "patterns"],
            "difficulty": 0.4,
        },
        "linear-regression": {
            "id": "linear-regression",
            "name": "Linear regression",
            "description": "Predicting a continuous output as a linear combination of features.",
            "prerequisites": ["supervised-learning"],
            "keywords": ["linear regression", "OLS", "least squares"],
            "difficulty": 0.4,
        },
        "logistic-regression": {
            "id": "logistic-regression",
            "name": "Logistic regression",
            "description": "Classification via a sigmoid-transformed linear model.",
            "prerequisites": ["linear-regression"],
            "keywords": ["logistic", "sigmoid", "classification"],
            "difficulty": 0.5,
        },
        "gradient-descent": {
            "id": "gradient-descent",
            "name": "Gradient descent",
            "description": "Iterative optimization that moves parameters against the gradient.",
            "prerequisites": [],
            "keywords": ["gradient descent", "SGD", "optimization"],
            "difficulty": 0.5,
        },
        "overfitting": {
            "id": "overfitting",
            "name": "Overfitting",
            "description": "Model fits training noise, generalizes poorly to new data.",
            "prerequisites": ["supervised-learning"],
            "keywords": ["overfitting", "generalization", "memorization"],
            "difficulty": 0.4,
        },
        "regularization": {
            "id": "regularization",
            "name": "Regularization",
            "description": "Penalty added to the loss to prevent overfitting.",
            "prerequisites": ["overfitting"],
            "keywords": ["regularization", "L1", "L2", "ridge", "lasso"],
            "difficulty": 0.5,
        },
        "bias-variance": {
            "id": "bias-variance",
            "name": "Bias-variance tradeoff",
            "description": "Models balance simplicity (high bias) against flexibility (high variance).",
            "prerequisites": ["overfitting"],
            "keywords": ["bias variance", "tradeoff", "underfitting"],
            "difficulty": 0.6,
        },
        "cross-validation": {
            "id": "cross-validation",
            "name": "Cross-validation",
            "description": "Evaluating model performance by rotating training and validation splits.",
            "prerequisites": ["supervised-learning"],
            "keywords": ["cross validation", "k-fold", "holdout"],
            "difficulty": 0.5,
        },
        "kmeans": {
            "id": "kmeans",
            "name": "K-means clustering",
            "description": "Partitions n points into k groups by minimizing within-cluster distance.",
            "prerequisites": ["unsupervised-learning"],
            "keywords": ["k-means", "kmeans", "clustering", "centroid"],
            "difficulty": 0.5,
        },
        "decision-tree": {
            "id": "decision-tree",
            "name": "Decision tree",
            "description": "Hierarchical model that splits data by feature thresholds.",
            "prerequisites": ["supervised-learning"],
            "keywords": ["decision tree", "CART", "splits"],
            "difficulty": 0.5,
        },
        "random-forest": {
            "id": "random-forest",
            "name": "Random forest",
            "description": "Ensemble of decision trees trained on bootstrap samples.",
            "prerequisites": ["decision-tree"],
            "keywords": ["random forest", "ensemble", "bagging"],
            "difficulty": 0.6,
        },
        "neural-network": {
            "id": "neural-network",
            "name": "Neural network",
            "description": "Layered model of linear transforms and nonlinear activations.",
            "prerequisites": ["gradient-descent", "linear-regression"],
            "keywords": ["neural network", "MLP", "deep learning"],
            "difficulty": 0.6,
        },
        "backpropagation": {
            "id": "backpropagation",
            "name": "Backpropagation",
            "description": "Algorithm for efficiently computing gradients in a neural network via chain rule.",
            "prerequisites": ["neural-network", "gradient-descent"],
            "keywords": ["backprop", "backpropagation", "chain rule"],
            "difficulty": 0.7,
        },
    }
}


DEMO_CHUNKS = [
    DemoChunk(
        module_id="module_1_foundations",
        section_id="mean-variance",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["mean", "variance"],
        heading_trail=["Foundations", "Statistical basics"],
        text=(
            "The mean is the arithmetic average: sum of values divided by count. "
            "The variance measures how far values spread from the mean — specifically, "
            "the average squared deviation from the mean. A small variance means values "
            "cluster tightly around the mean; a large variance means they're spread out. "
            "Standard deviation is the square root of variance, with the same units as the data."
        ),
        difficulty=0.2,
    ),
    DemoChunk(
        module_id="module_1_foundations",
        section_id="normal-dist",
        chunk_index=1,
        chunk_type="prose",
        concept_ids=["normal-distribution", "mean", "variance"],
        heading_trail=["Foundations", "Distributions", "Normal"],
        text=(
            "The normal distribution, also called Gaussian, is a bell-shaped curve defined by "
            "two parameters: the mean (center) and the variance (width). It shows up in nature "
            "because of the central limit theorem: sums of many independent random variables "
            "tend toward normality. In ML we often assume errors are normally distributed, "
            "which is why least-squares regression works well."
        ),
        difficulty=0.4,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="intro",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["supervised-learning"],
        heading_trail=["Supervised Learning", "Introduction"],
        text=(
            "Supervised learning means learning from examples where both inputs and correct outputs "
            "are provided. Given pairs (x, y), the goal is to find a function f such that f(x) "
            "predicts y well for new inputs. Two main subtypes: regression (y is continuous, like "
            "house price) and classification (y is categorical, like spam/not-spam). Training "
            "minimizes a loss function that measures prediction error on known examples."
        ),
        difficulty=0.3,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="linear-regression",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["linear-regression", "supervised-learning"],
        heading_trail=["Supervised Learning", "Linear regression"],
        text=(
            "Linear regression predicts a continuous output as y = w·x + b, where w is a weight "
            "vector and b is a scalar bias. Training finds the w, b that minimize mean squared "
            "error on the training data. The closed-form solution is (X^T X)^(-1) X^T y, but in "
            "practice we often use gradient descent, especially when the number of features is large."
        ),
        difficulty=0.4,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="linear-regression",
        chunk_index=1,
        chunk_type="example",
        concept_ids=["linear-regression"],
        heading_trail=["Supervised Learning", "Linear regression", "Example"],
        text=(
            "Example: predict house price from square footage. You have 1000 training examples "
            "(square_feet, price). Linear regression fits a line: price = w * square_feet + b. "
            "After training, you can predict the price of a new house by plugging in its square "
            "footage. Quality of the fit depends on how linear the relationship actually is — "
            "houses in desirable neighborhoods may deviate from a simple linear trend."
        ),
        difficulty=0.4,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="logistic-regression",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["logistic-regression", "linear-regression"],
        heading_trail=["Supervised Learning", "Logistic regression"],
        text=(
            "Logistic regression solves classification problems by running a linear model w·x + b "
            "through a sigmoid function σ(z) = 1/(1+e^-z), producing a probability between 0 and 1. "
            "If the probability exceeds a threshold (usually 0.5), predict the positive class. "
            "Despite the name, it's a classifier, not a regressor. Training minimizes cross-entropy "
            "loss rather than MSE, because MSE is non-convex for classification."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="gradient-descent",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["gradient-descent"],
        heading_trail=["Supervised Learning", "Gradient descent"],
        text=(
            "Gradient descent iteratively improves parameters by stepping in the direction of "
            "decreasing loss. Each step: compute the gradient ∇L(θ) of the loss with respect to "
            "parameters, then update θ ← θ - η∇L where η is the learning rate. Too large a "
            "learning rate overshoots and diverges. Too small, and convergence is slow. "
            "Stochastic gradient descent (SGD) uses a random subset of data per step for speed."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="overfitting",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["overfitting", "supervised-learning"],
        heading_trail=["Supervised Learning", "Overfitting"],
        text=(
            "Overfitting means the model has memorized training-specific noise instead of learning "
            "the underlying pattern. Signs: training loss keeps decreasing but validation loss "
            "starts rising. A 50-layer neural network trained on 100 examples will almost certainly "
            "overfit. Defenses: more training data, simpler model, regularization, early stopping, "
            "dropout, cross-validation to detect it."
        ),
        difficulty=0.4,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="regularization",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["regularization", "overfitting"],
        heading_trail=["Supervised Learning", "Regularization"],
        text=(
            "Regularization adds a penalty term to the loss to discourage large parameter values, "
            "which usually correspond to overfitting. L2 regularization (ridge) adds λ||w||² and "
            "shrinks weights smoothly. L1 regularization (lasso) adds λ||w||₁ and drives some "
            "weights exactly to zero, giving a sparse model that's easier to interpret. "
            "Elastic net combines both."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="bias-variance",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["bias-variance", "overfitting"],
        heading_trail=["Supervised Learning", "Bias-variance"],
        text=(
            "Model error decomposes into bias (systematic error from wrong assumptions), variance "
            "(error from sensitivity to small changes in training data), and irreducible noise. "
            "A simple model (like linear regression on a curved relationship) has high bias, low "
            "variance — it underfits. A complex model (like a deep tree) has low bias, high "
            "variance — it overfits. The sweet spot is balanced, often requiring cross-validation."
        ),
        difficulty=0.6,
    ),
    DemoChunk(
        module_id="module_2_supervised",
        section_id="cross-validation",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["cross-validation"],
        heading_trail=["Supervised Learning", "Cross-validation"],
        text=(
            "K-fold cross-validation splits training data into k groups (folds). For each fold, "
            "train on the other k-1 folds and validate on that fold. Average the k validation "
            "scores. This gives a more reliable estimate of generalization than a single holdout "
            "split. Common values: k=5 or k=10. Leave-one-out is k=n, thorough but slow."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_3_unsupervised",
        section_id="intro",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["unsupervised-learning"],
        heading_trail=["Unsupervised Learning", "Introduction"],
        text=(
            "Unsupervised learning finds structure in data without labels. The main tasks are "
            "clustering (group similar points), dimensionality reduction (find a lower-dimensional "
            "representation that preserves key structure), and density estimation (model the "
            "probability distribution). Applications: customer segmentation, anomaly detection, "
            "exploratory data analysis, pretraining for downstream supervised tasks."
        ),
        difficulty=0.4,
    ),
    DemoChunk(
        module_id="module_3_unsupervised",
        section_id="kmeans",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["kmeans", "unsupervised-learning"],
        heading_trail=["Unsupervised Learning", "K-means"],
        text=(
            "K-means partitions n points into k clusters by alternating two steps: (1) assign each "
            "point to the nearest centroid; (2) update each centroid to the mean of its assigned "
            "points. Repeat until assignments stabilize. The choice of k is crucial. Methods: "
            "elbow method (plot within-cluster sum-of-squares vs k), silhouette analysis, "
            "domain knowledge. K-means assumes clusters are roughly spherical and equally sized."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_3_unsupervised",
        section_id="kmeans",
        chunk_index=1,
        chunk_type="example",
        concept_ids=["kmeans"],
        heading_trail=["Unsupervised Learning", "K-means", "Example"],
        text=(
            "Example: customer segmentation. Given customer data (age, income, purchases), k-means "
            "groups similar customers together. You might find three clusters: young high-spenders, "
            "middle-aged frugal savers, older high-value customers. These segments inform marketing: "
            "target each cluster with different messages. The key insight from clustering is often "
            "the segments themselves, not the exact assignments."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_4_trees",
        section_id="decision-tree",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["decision-tree", "supervised-learning"],
        heading_trail=["Tree Methods", "Decision trees"],
        text=(
            "A decision tree recursively splits data by asking yes/no questions on features. "
            "At each node, choose the split that best separates the classes, measured by metrics "
            "like Gini impurity or information gain. Leaves give the predicted class (or average "
            "target value for regression). Trees are interpretable — you can read off the decision "
            "path. But deep trees overfit easily; prune them, or use ensembles like random forest."
        ),
        difficulty=0.5,
    ),
    DemoChunk(
        module_id="module_4_trees",
        section_id="random-forest",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["random-forest", "decision-tree"],
        heading_trail=["Tree Methods", "Random forest"],
        text=(
            "Random forest trains many decision trees on bootstrapped subsets of the data, with "
            "each split considering only a random subset of features. At inference time, "
            "predictions are averaged (regression) or voted (classification). This reduces "
            "variance significantly while keeping bias low. Random forests work remarkably well "
            "on tabular data with almost no tuning, and give feature importance scores for free."
        ),
        difficulty=0.6,
    ),
    DemoChunk(
        module_id="module_5_neural",
        section_id="intro",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["neural-network", "gradient-descent"],
        heading_trail=["Neural Networks", "Introduction"],
        text=(
            "A neural network is a stack of layers, each applying a linear transform W·x + b "
            "followed by a nonlinear activation (ReLU, tanh, sigmoid). Multiple layers allow "
            "approximating complex functions. The universal approximation theorem says a single "
            "hidden layer with enough units can represent any continuous function, but in practice "
            "depth helps. Training uses gradient descent with gradients computed by backpropagation."
        ),
        difficulty=0.6,
    ),
    DemoChunk(
        module_id="module_5_neural",
        section_id="backprop",
        chunk_index=0,
        chunk_type="prose",
        concept_ids=["backpropagation", "neural-network", "gradient-descent"],
        heading_trail=["Neural Networks", "Backpropagation"],
        text=(
            "Backpropagation computes gradients of the loss with respect to every parameter, "
            "efficiently. Forward pass: compute the output layer by layer. Backward pass: use the "
            "chain rule to propagate gradients backward, from output to input. The key insight: "
            "computing gradients via chain rule once is O(network size), far cheaper than "
            "finite differences. This is why deep learning became feasible."
        ),
        difficulty=0.7,
    ),
]


# =============================================================================
# SEEDING
# =============================================================================
async def seed_demo_content(course_id: str = "ml-fundamentals") -> None:
    """Ingest demo chunks into Qdrant, write lattice to Postgres."""
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.mira.models.db_models import MiraConceptLattice
    from app.mira.retrieval.qdrant_client import QdrantVectorStore
    from app.mira.retrieval.retriever import FakeEmbedder, OpenAIEmbedder

    # Setup connections
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    # Embedder
    if openai_key:
        embedder = OpenAIEmbedder(api_key=openai_key)
        logger.info("Using OpenAI embeddings (~₹5-10 for seeding)")
    else:
        embedder = FakeEmbedder(dimension=128)
        logger.warning("Using FakeEmbedder (no OPENAI_API_KEY). Retrieval quality lower.")

    # Vector store
    vector_store = QdrantVectorStore(url=qdrant_url)
    await vector_store.ensure_collection()

    # 1. Write lattice
    async with SessionLocal() as db:
        # Delete existing lattice for this course
        await db.execute(
            delete(MiraConceptLattice).where(
                MiraConceptLattice.course_id == course_id
            )
        )
        db.add(
            MiraConceptLattice(
                course_id=course_id,
                module_id=None,  # course-level lattice
                lattice=DEMO_LATTICE,
                version=1,
                generated_by="demo_seed",
            )
        )
        await db.commit()
    logger.info(f"Wrote lattice for {course_id} ({len(DEMO_LATTICE['concepts'])} concepts)")

    # 2. Embed chunks and upsert to Qdrant
    from app.mira.retrieval.qdrant_client import VectorPoint

    points: list[VectorPoint] = []
    texts = [c.text for c in DEMO_CHUNKS]
    logger.info(f"Embedding {len(texts)} chunks...")
    embeddings = await embedder.embed_batch(texts)

    for i, (chunk, vec) in enumerate(zip(DEMO_CHUNKS, embeddings)):
        chunk_id = f"{course_id}_{chunk.module_id}_{chunk.section_id}_{chunk.chunk_index}"
        content_hash = hashlib.sha256(chunk.text.encode()).hexdigest()[:16]
        points.append(
            VectorPoint(
                id=chunk_id,
                vector=vec,
                payload={
                    "chunk_id": chunk_id,
                    "source_type": "course",
                    "course_id": course_id,
                    "module_id": chunk.module_id,
                    "section_id": chunk.section_id,
                    "chunk_index": chunk.chunk_index,
                    "chunk_type": chunk.chunk_type,
                    "concept_ids": chunk.concept_ids,
                    "text": chunk.text,
                    "heading_trail": chunk.heading_trail,
                    "difficulty": chunk.difficulty,
                    "has_code": False,
                    "has_diagram": False,
                    "content_hash": content_hash,
                },
            )
        )

    await vector_store.upsert_many(points)
    logger.info(f"Upserted {len(points)} chunks into Qdrant")

    logger.info("")
    logger.info(f"Demo seed complete for course_id={course_id!r}")
    logger.info("Testers can now ask questions scoped to this course.")
    logger.info("Example: POST /api/mira/chat with section='course', course_id='ml-fundamentals'")


if __name__ == "__main__":
    course_id = sys.argv[1] if len(sys.argv) > 1 else "ml-fundamentals"
    asyncio.run(seed_demo_content(course_id))
