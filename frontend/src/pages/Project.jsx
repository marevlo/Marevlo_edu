import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Search, Eye, Heart, Clock, ExternalLink, Github, Download, X,
    Zap, Star, ChevronDown, Filter, BookOpen,
    Cpu, BarChart2, MessageSquare, Globe, SlidersHorizontal,
    ArrowUpRight, Code2, Database, Brain, Sparkles, FileText, Target,
    CheckCircle, FlaskConical, GraduationCap, ChevronRight
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import ProjectDetail from './ProjectDetail';
import ShowcaseCard from '../components/ShowcaseCard';

// Project Data
const PROJECTS_DATA = [
    {
        id: 1,
        title: 'Mental Health Detection from Social Media',
        description: 'A fine-tuned BERT-based transformer that reads social media posts and detects deteriorating mental health — a smoke detector for the mind.',
        longDescription: 'Every day, millions of people post about depression, anxiety, and hopelessness on Reddit, Twitter, and other social platforms — often before they ever tell a doctor or loved one. Existing systems either catch too little (missing real crises) or trigger too many false alarms (burning out mental health workers). This project builds a reliable, explainable AI that reads social media posts and detects deteriorating mental health early enough for an intervention to help.',
        thumbnail: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=340&fit=crop',
        tags: ['NLP', 'Deep Learning', 'BERT', 'Advanced'],
        category: 'NLP',
        views: 8269,
        likes: 623,
        lastUpdated: 'Active',
        techStack: ['Python', 'RoBERTa', 'MentalBERT', 'SHAP', 'SMOTE', 'HuggingFace'],
        githubUrl: '#',
        featured: true,
        question: 'Can a fine-tuned BERT-based transformer model, trained on multi-source Reddit mental health data (depression, SuicideWatch, anxiety subreddits) with temporal posting behaviour features, detect multi-class mental health states — ranging from healthy, to mild distress, to active crisis — with macro-F1 ≥ 0.85 and a false negative rate on active crisis posts ≤ 10%, while providing SHAP-based word-level explanations that a clinician can understand and trust?',
        methodology: [
            'Gather posts from Reddit communities: r/depression, r/SuicideWatch, r/anxiety (distressed labels) and r/happy or r/CasualConversation (healthy baseline). Each post gets a label: 0 = healthy, 1 = mild, 2 = moderate, 3 = crisis.',
            'Clean the text. Remove usernames (@user), URLs, and special characters. Keep emoticons — they carry emotional meaning. Tokenise using the BERT tokenizer.',
            'Fine-tune a pre-trained RoBERTa or MentalBERT model on the classification task (~30 minutes on free Google Colab GPU).',
            'Add temporal features: track post frequency per week, average sentiment score per week, and whether sentiment is trending downward. Combine with text model using late-fusion.',
            'Handle class imbalance: active crisis posts are rare. Use SMOTE or generate synthetic examples using GPT-4 to balance the classes.',
            'Add SHAP explanations: for each prediction, SHAP highlights which words contributed most (e.g., "worthless," "no point," "can\'t sleep").',
            'Evaluate on a held-out test set AND on an external dataset the model has never seen (cross-domain test).',
        ],
        datasets: [
            { name: 'thePixel42/depression-detection', source: 'HuggingFace', desc: '200,000 labelled posts from r/teenagers, r/SuicideWatch, r/depression', url: 'https://huggingface.co/datasets/thePixel42/depression-detection' },
            { name: 'mrjunos/depression-reddit-cleaned', source: 'HuggingFace', desc: '7,000 cleaned Reddit posts; best beginner starting point', url: 'https://huggingface.co/datasets/mrjunos/depression-reddit-cleaned' },
            { name: 'solomonk/reddit_mental_health_posts', source: 'HuggingFace', desc: 'Multi-subreddit mental health posts', url: 'https://huggingface.co/datasets/solomonk/reddit_mental_health_posts' },
            { name: 'andreagasparini/dreaddit', source: 'HuggingFace', desc: '3,500 human-annotated Reddit stress segments from 5 categories', url: 'https://huggingface.co/datasets/andreagasparini/dreaddit' },
            { name: 'irlab-udc/redsm5', source: 'HuggingFace', desc: '1,484 Reddit posts annotated sentence-by-sentence by a licensed psychologist for all 9 DSM-5 depression symptoms', url: 'https://huggingface.co/datasets/irlab-udc/redsm5' },
            { name: 'MentalRoBERTa Pre-trained Model', source: 'HuggingFace', desc: 'A BERT model already fine-tuned on mental health corpora', url: '#' },
        ],
        papers: [
            'Detection of Depression Severity Using Transformer-Based Models — MDPI Information, 2025',
            'Deep Learning-Based Detection of Depression and Suicidal Tendencies — PMC, 2025',
            'Advancing Mental Disorder Detection: Transformers vs LSTM — arXiv, 2025',
            'Early Detection of Mental Health Crises via AI Analysis — PMC, 2024',
            'Exploring Emotional Patterns via NLP for Mental Health — PMC, 2025',
        ],
        evaluation: [
            'Macro-F1 score (measures performance evenly across all severity levels)',
            'Recall on crisis class specifically (missing a real crisis is the most dangerous error)',
            'False Positive Rate (flagging healthy posts wastes clinical resources)',
            'SHAP explanation quality: do highlighted words align with what a psychologist would look at?',
            'Cross-domain generalisation: train on Reddit, test on a different platform',
        ],
        minimumScore: 'Macro-F1 ≥ 0.85 | Crisis Recall ≥ 90% | False Negative Rate ≤ 10% | SHAP agreement ≥ 80% | Cross-domain F1 degradation ≤ 15%',
        dataExplanation: 'Each sample is one Reddit post (a paragraph of free text) with a label indicating mental health status. Labels range from healthy to crisis. Some datasets include multiple posts per user over time for temporal trend analysis. The main challenge is class imbalance: around 3–5% of posts reflect active crisis. Text is informal, has misspellings, slang, and code-switched language.',
    },
    {
        id: 2,
        title: 'Gut Health Prediction from Diet Patterns',
        description: 'A Hypergraph Neural Network that models food–microbiome–disease relationships to predict whether a diet will shift your gut toward disease risk.',
        longDescription: 'Your gut contains trillions of bacteria — your microbiome — and what you eat directly shapes which bacteria thrive. The right microbiome protects you from diabetes, IBS, obesity, and even depression. This project uses a Graph Neural Network to model the complex web-like relationships between 500+ bacterial species and hundreds of food components simultaneously.',
        thumbnail: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'GNN', 'Bioinformatics', 'Advanced'],
        category: 'Graph Neural Networks',
        views: 6340,
        likes: 489,
        lastUpdated: 'Active',
        techStack: ['Python', 'PyTorch Geometric', 'HyperGNN', 'NetworkX', 'Scikit-learn'],
        githubUrl: '#',
        featured: true,
        question: 'Can a hypergraph neural network trained on a food–microbiome–disease association database predict whether a given 7-day dietary pattern will shift a person\'s microbiome toward a disease-risk profile (e.g., low Firmicutes/Bacteroidetes ratio associated with obesity), with an AUC-ROC ≥ 0.82 and AUPR ≥ 0.78 on held-out test subjects?',
        methodology: [
            'Think of this as a network (graph) problem. Nodes: food items, bacterial species, and diseases. Edges: known interactions like "eating brown rice increases Lactobacillus, which reduces diabetes risk."',
            'Build the graph from published literature and databases (FMD database — 190 foods, 219 microbes, 163 diseases).',
            'Use a Hypergraph Neural Network (HyperGNN): a hyperedge connects three or more nodes at once (food A + microbe B → disease C), modelling real tripling interactions.',
            'For a specific patient, represent their 7-day diet as a feature vector (foods, quantities, time of day). Feed into the trained HyperGNN.',
            'The model outputs: "This dietary pattern pushes your microbiome toward a Firmicutes-dominant state, associated with 67% increased obesity risk." Graph attention weights provide explanation.',
            'Validate on held-out subjects from a real dietary intervention study (pre-intervention vs. post-intervention microbiome samples).',
        ],
        datasets: [
            { name: 'American Gut Project', source: 'GitHub', desc: 'Largest public microbiome dataset; 15,000+ subjects with diet questionnaires and 16S sequencing', url: 'https://github.com/biocore/American-Gut' },
            { name: 'Human Microbiome Project', source: 'AWS Open Data', desc: 'NIH-funded reference dataset of 300 healthy adults, 18 body sites', url: '#' },
            { name: 'Gut Microbiome-Metabolome Collection', source: 'Nature npj', desc: 'Paired microbiome + metabolome data from multiple cohorts', url: '#' },
            { name: 'Human Microbiome Compendium', source: 'microbiomap.org', desc: 'Largest harmonised public microbiome dataset — 168,000 samples', url: '#' },
            { name: 'OpenFoodFacts', source: 'openfoodfacts.org', desc: '3 million+ foods with full nutritional breakdown; use to build food nodes', url: 'https://open.openfoodfacts.org' },
        ],
        papers: [
            'Graph Neural Networks for Gut Microbiome Metaomic Data — arXiv, 2024',
            'SIMBA-GNN: Mechanistic Graph Learning for Microbiome — Nature npj, 2025',
            'Lightweight Hypergraph Neural Network for Food–Microbe–Disease — BMC Bioinformatics, 2025',
            'Deep Learning in Microbiome Analysis: Comprehensive Review — Frontiers in Microbiology, 2025',
            'Predicting Metabolite Response to Dietary Intervention — Nature Communications, 2025',
        ],
        evaluation: [
            'AUC-ROC (overall discriminative ability across all microbiome-phenotype pairs)',
            'AUPR — Area Under Precision-Recall Curve (more informative when data is sparse and imbalanced)',
            'Mean Reciprocal Rank (how well does the model rank true disease-microbe associations)',
            'Explanation quality: do attention weights highlight biologically relevant species and food items?',
        ],
        minimumScore: 'AUC-ROC ≥ 0.82 | AUPR ≥ 0.78 | MRR ≥ 0.65 on held-out food-microbe-disease triplets',
        dataExplanation: 'Microbiome data is a table where each row is a person, each column is a bacterial species, and values are relative abundances. Diet data is a log of what the person ate for how many days. The challenge is sparsity — most people have not been measured for all 500+ bacterial species.',
    },
    {
        id: 3,
        title: 'Student Knowledge State Tracking',
        description: 'An LSTM-based Deep Knowledge Tracing model with forgetting mechanism and concept graphs — a GPS for learning that predicts what a student knows and is about to forget.',
        longDescription: 'Imagine a maths tutoring app that, after watching a student answer 20 questions, knows exactly which concepts they understand and which they are about to forget — and then chooses the perfect next question to maximise learning. This project builds Deep Knowledge Tracing (DKT) enhanced with forgetting curves and prerequisite concept graphs.',
        thumbnail: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'LSTM', 'EdTech', 'Advanced'],
        category: 'Deep Learning',
        views: 5570,
        likes: 402,
        lastUpdated: 'Active',
        techStack: ['Python', 'PyTorch', 'LSTM', 'pyKT', 'Graph Attention', 'Scikit-learn'],
        githubUrl: '#',
        featured: false,
        question: 'Can a Deep Knowledge Tracing model enhanced with a forgetting mechanism (Ebbinghaus\' forgetting curve), a prerequisite concept graph, and a student-level learning rate estimator, predict whether a student will answer the next question correctly with AUC ≥ 0.87 and outperform baseline DKT by ≥ 5% AUC, while providing skill-level mastery estimates that match expert teacher judgements?',
        methodology: [
            'Represent each student\'s learning history as a sequence: [(question 1, concept: addition, correct), (question 2, concept: subtraction, wrong), …]. Each event has a timestamp.',
            'Train the base LSTM-DKT: reads the sequence left to right, updating a hidden "knowledge state" vector after each answer. Output: probability of answering the next question correctly.',
            'Add a forgetting module: use exponential decay (Ebbinghaus\' forgetting curve) to reduce knowledge state for concepts not practised recently.',
            'Build a concept dependency graph: "you need multiplication before division." Add Graph Attention layer to modify concept relationships in the LSTM hidden state.',
            'For cold-start students (very few interactions), use LLM-based prior knowledge estimation with 3 diagnostic questions.',
            'Evaluate with AUC on next-question prediction AND skill-level accuracy (does the model\'s mastery score for "fractions" match what a teacher would say?).',
        ],
        datasets: [
            { name: 'ASSISTments/FoundationalASSIST', source: 'HuggingFace', desc: '1.7M student interactions, 5,000 students, complete problem text', url: 'https://huggingface.co/datasets/ASSISTments/FoundationalASSIST' },
            { name: 'ASSISTments 2009-2010', source: 'Official Site', desc: '346,860 interactions, 4,217 students; gold standard DKT benchmark', url: '#' },
            { name: 'ASSISTments 2015', source: 'Official Site', desc: '708,631 interactions, 19,917 students, 100 skills', url: '#' },
            { name: 'EdNet Dataset', source: 'GitHub (riiid)', desc: 'Largest education dataset: 131M interactions, TOEIC preparation', url: 'https://github.com/riiid/ednet' },
            { name: 'pyKT Python Toolkit', source: 'GitHub', desc: '10+ DKT models implemented (DKT, DKVMN, SAKT, AKT, SimpleKT), 7 datasets pre-integrated', url: 'https://github.com/pykt-team/pykt-toolkit' },
        ],
        papers: [
            'Deep Knowledge Tracing — Stanford, Piech et al. (original foundational paper)',
            'Deep Learning Based Knowledge Tracing: A Review — ACM, 2025',
            'Deep Knowledge Tracing and Cognitive Load Estimation — Nature Scientific Reports, 2025',
            'DKT2: Improved Deep Knowledge Tracing — arXiv, 2025',
            'Practical Evaluation of DKT Models — EDM 2025',
        ],
        evaluation: [
            'AUC-ROC on binary prediction (correct vs. wrong) — main metric',
            'Accuracy (% of next-question predictions that are correct)',
            'Knowledge state interpretability: does concept-level mastery match teacher ratings?',
            'Cold-start performance: AUC for students with fewer than 10 prior interactions',
            'Forgetting simulation accuracy: does predicted mastery decay match observed re-test performance?',
        ],
        minimumScore: 'AUC-ROC ≥ 0.87 on ASSISTments 2015 | ≥ 5% AUC improvement over baseline DKT | Cold-start AUC ≥ 0.78',
        dataExplanation: 'Each row is one student answering one question: student_id, question_id, skill_concept, correctness (1/0), timestamp. The model reads these in time order per student. Key challenge: some students answer 5 questions, others answer 5,000 — the model must work well across both.',
    },
    {
        id: 4,
        title: 'Financial Document Understanding',
        description: 'A LayoutLMv3-powered system that reads both the words AND their 2D positions on financial documents to extract structured data from annual reports, balance sheets, and tax filings.',
        longDescription: 'Financial documents are not just text — they are a mix of text, tables, numbers, and visual layouts. A regular BERT model reads them like a blind person: it gets the words but misses that "Revenue: $12M" is in the top-right corner of a table in bold. LayoutLMv3 reads both the words AND where they are positioned on the page AND what they look like visually.',
        thumbnail: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=340&fit=crop',
        tags: ['NLP', 'Document AI', 'LayoutLM', 'Advanced'],
        category: 'NLP',
        views: 4130,
        likes: 319,
        lastUpdated: 'Active',
        techStack: ['Python', 'LayoutLMv3', 'Tesseract OCR', 'HuggingFace', 'DocTR', 'SEC EDGAR'],
        githubUrl: '#',
        featured: true,
        question: 'Can a fine-tuned LayoutLMv3 model, trained on public financial form datasets and SEC EDGAR annual reports, extract key financial entities (revenue, EBITDA, debt-to-equity ratio, risk factors) from unseen company filings — including multi-page, multi-table documents — with entity-level F1 ≥ 0.88 and table cell extraction accuracy ≥ 85%, generalising across at least 3 different unseen document layouts?',
        methodology: [
            'Take a scanned or digital PDF. Run OCR (Tesseract or DocTR) to extract each word plus its bounding box coordinates (x, y, width, height on the page).',
            'Feed each token into LayoutLMv3 with three inputs: (a) the word itself, (b) its 2D position, (c) an image patch of the page region. The model learns that words in table headers have a different meaning than body text.',
            'Fine-tune on labelled NER dataset: each word labelled as "B-REVENUE", "I-REVENUE", "B-RISK", etc. using standard IOB labelling scheme.',
            'For multi-page documents, use chunking: process each page independently, then use cross-page attention to resolve references across pages ("see Note 14").',
            'Evaluate on unseen company filings from sectors not in training (e.g., train on tech, test on pharmaceutical).',
        ],
        datasets: [
            { name: 'FUNSD Dataset', source: 'Official', desc: '199 annotated scanned forms; the primary LayoutLM benchmark', url: 'https://guillaumejaume.github.io/FUNSD' },
            { name: 'FUNSD (LayoutLMv2 format)', source: 'HuggingFace', desc: 'Same FUNSD pre-formatted for LayoutLM; load in one line', url: '#' },
            { name: 'SEC EDGAR Full-Text Search', source: 'US SEC Official', desc: 'Annual reports (10-K) from all US-listed companies; downloadable in HTML/XBRL', url: '#' },
            { name: 'FinanceBench', source: 'GitHub (patronus-ai)', desc: '150 financial QA pairs over real SEC filings with verified ground-truth', url: 'https://github.com/patronus-ai/financebench' },
            { name: 'DocVQA Dataset', source: 'HuggingFace', desc: '50,000 QA pairs over document images; broad document understanding benchmark', url: '#' },
        ],
        papers: [
            'LayoutLM: Pre-training of Text and Layout for Document Image Understanding — Microsoft Research',
            'LayoutLMv3 — HuggingFace / Microsoft (official model, handles text+layout+image)',
            'NLP in Finance: A Comprehensive Survey — ScienceDirect / Information Fusion, 2024',
            'LLMs for Financial Document Analysis — IntuitionLabs, 2025',
            'Large Language Models in Finance (FinLLMs Survey) — Neural Computing, 2025',
        ],
        evaluation: [
            'Entity-level F1 score (precision and recall on extracting financial entities)',
            'Table cell extraction accuracy (did it read the right cell from the right row?)',
            'Cross-layout generalisation: performance on document layouts not seen during training',
            'End-to-end QA accuracy (given a filing, can it answer "What was the 2024 revenue?")',
            'Hallucination rate: does the model ever extract a number not in the document?',
        ],
        minimumScore: 'Entity-level F1 ≥ 0.88 on FUNSD | Table extraction accuracy ≥ 85% | Cross-layout F1 degradation ≤ 8%',
        dataExplanation: 'Each training sample is a document image (or PDF page) paired with word-level annotations: bounding boxes for every word, plus entity labels. Financial documents are tricky because the same concept (e.g., "Net Revenue") appears in different positions and formats across companies.',
    },
    {
        id: 5,
        title: 'Crop Yield Prediction under Climate Variability',
        description: 'A multi-branch CNN+LSTM model that fuses satellite imagery and weather time series to predict district-level crop yield 30+ days before harvest — even in climate-volatile years.',
        longDescription: 'A farmer needs to know before harvest: will the yield be good or bad this year? AI models trained on US or European farms fail on Indian farms because climate, crop variety, and farming practices are completely different. This project builds a CNN that reads satellite images (crop health from space) while an LSTM tracks how conditions evolved over the growing season.',
        thumbnail: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'Computer Vision', 'LSTM', 'Advanced'],
        category: 'Computer Vision',
        views: 5910,
        likes: 441,
        lastUpdated: 'Active',
        techStack: ['Python', 'ResNet-18', 'LSTM', 'Sentinel-2', 'Google Earth Engine', 'NASA POWER API'],
        githubUrl: '#',
        featured: false,
        question: 'Can a multi-branch deep learning model that fuses: (a) multi-temporal Sentinel-2 satellite image patches through a CNN, with (b) meteorological time series through an LSTM — predict district-level crop yield for wheat and soybean in Indian states with R² ≥ 0.80 and RMSE ≤ 8% of mean yield, at least 30 days before harvest, and remain stable across years with abnormal rainfall?',
        methodology: [
            'Collect Sentinel-2 satellite images for target region (e.g., Madhya Pradesh) every 14 days during growing season. Each image: 224×224 pixel patch per district with 13 spectral bands.',
            'Compute vegetation indices: NDVI (how green/alive is the crop), EVI (Enhanced), NDRE (Red-Edge, sensitive to chlorophyll). These turn raw satellite bands into meaningful crop health numbers.',
            'Run image patches through a CNN (ResNet-18). The CNN learns spatial features: "this pattern of greenness at mid-season is associated with good yield." Output: feature vector per time step per district.',
            'Collect daily weather data (rainfall, temperature, solar radiation, humidity). Stack as time series. Feed into LSTM that learns temporal patterns like "3 consecutive weeks of drought in March always means yield drop."',
            'Fuse CNN feature vector and LSTM output using multi-head attention. The model learns how much to weight satellite vs. weather at each point in the season.',
            'Train on 5–8 years of historical data. Test on most recent 1–2 years (including an anomalous monsoon year — the climate variability stress test).',
        ],
        datasets: [
            { name: 'CropNet Dataset', source: 'HuggingFace (KDD 2024)', desc: 'Sentinel-2 imagery + meteorology + USDA yield data for 2,291 US counties, 6 years', url: 'https://huggingface.co/datasets/CropNet/CropNet' },
            { name: 'CropNet GitHub', source: 'GitHub', desc: 'Colab tutorials, DataDownloader API, and MMST-ViT baseline model', url: '#' },
            { name: 'Crop Production in India', source: 'Kaggle', desc: 'District-wise, season-wise crop production data for India', url: 'https://kaggle.com/datasets/abhinand05/crop-production-in-india' },
            { name: 'Crop Yield in Indian States', source: 'Kaggle', desc: 'State-level yield data for Indian crops; cleaned and beginner-ready', url: '#' },
            { name: 'NASA POWER Meteorological API', source: 'NASA (free)', desc: 'Daily climate variables for any latitude/longitude on Earth', url: '#' },
            { name: 'Sentinel-2 via Google Earth Engine', source: 'Google (free)', desc: 'Multispectral satellite images globally; accessible from Colab', url: '#' },
        ],
        papers: [
            'Crop Yield Prediction: Comprehensive Review of ML and DL — ScienceDirect, 2024',
            'DeepAgroNet: Predicting Wheat Yield Using Deep Learning — Nature Scientific Reports, 2025',
            'CropNet: Open Dataset for Climate-Aware Crop Yield Predictions — KDD 2024',
            'Deep Learning Based Farm-Level Crop Yield Prediction — ScienceDirect, 2025',
            'Enhanced Wheat Yield via Integrated Climate and Satellite Data — Nature, 2025',
        ],
        evaluation: [
            'R² score (how much yield variance the model explains; 1.0 = perfect)',
            'RMSE as % of mean yield (normalised RMSE; easier to interpret across crops)',
            'Lead time: how early before harvest can the model reach its target accuracy?',
            'Climate stress test: R² on years with anomalous rainfall vs. normal years',
            'Cross-region generalisation: train on Gujarat + MP, test on Punjab (unseen state)',
        ],
        minimumScore: 'R² ≥ 0.80 | Normalised RMSE ≤ 8% | Prediction ≥ 30 days before harvest | R² degradation in anomalous years ≤ 10%',
        dataExplanation: 'Satellite data is a 4D tensor: (time, height, width, spectral bands). ~10 image snapshots per district during growing season. Weather data is a 2D time series: (time, weather variable). Crop yield is a single number per district per year (tonnes/hectare). Indian crop data is noisy (survey-based), satellite images have cloud cover in monsoon, and each year\'s climate is different.',
    },
    {
        id: 6,
        title: 'ATM Cash Demand Forecasting',
        description: 'A time series forecasting model that predicts daily cash withdrawal amounts per ATM — so banks fill each machine with exactly the right amount, no more and no less.',
        longDescription: 'Too much cash in an ATM means wasted money, higher insurance costs, and capital locked up overnight. Too little cash means unhappy customers and costly emergency replenishments. This project uses time series forecasting to predict tomorrow\'s demand so banks can optimize replenishment schedules across their entire ATM network.',
        thumbnail: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=340&fit=crop',
        tags: ['Time Series', 'Deep Learning', 'LSTM', 'Advanced'],
        category: 'Time Series',
        views: 4810,
        likes: 356,
        lastUpdated: 'Active',
        techStack: ['Python', 'ARIMA', 'SARIMA', 'XGBoost', 'LSTM', 'Prophet', 'Scikit-learn'],
        githubUrl: '#',
        featured: false,
        question: 'Given historical daily cash withdrawal data from ATMs, can we accurately predict the cash demand for future days (e.g., tomorrow or next week) to optimize cash replenishment?',
        methodology: [
            'Data Preparation — Handle missing values (e.g., median of same weekday) and remove outliers caused by ATM downtime or data errors.',
            'Pattern Discovery — Identify weekly, monthly, and holiday effects using decomposition plots and autocorrelation analysis.',
            'Feature Creation — Add time-based features: day of week, is weekend, day of month, lag values (yesterday\'s demand), and rolling averages (7-day, 30-day).',
            'Model Selection — Start simple (Moving Average / SARIMA), then move to ML (Random Forest / XGBoost) or deep learning (LSTM). Compare all using the same validation scheme.',
            'Validation — Use time-based split (train on past, test on future) or walk-forward validation. Never randomly shuffle time series data.',
            'Evaluation — Measure error using sMAPE and RMSE; compare against a simple baseline (e.g., last week same day).',
        ],
        datasets: [
            { name: 'NN5 Daily Dataset', source: 'Zenodo', desc: '111 daily time series of cash withdrawals from ATMs in the UK; used in NN5 competition', url: 'https://zenodo.org/records/3898450' },
            { name: 'ATM Transaction Data Analysis', source: 'GitHub', desc: 'Daily cash withdrawal amounts with seasonality patterns + Jupyter Notebook with ANN', url: 'https://github.com/NILKANTHABAG/ATM_Transaction-data_analysis' },
            { name: 'Forecasting-ATM-Cash-Demand-in-India', source: 'GitHub', desc: 'Real-world ATM withdrawal data from Indian banks (RBI website), Jun–Sep 2020', url: 'https://github.com/d4deva/Forecasting-ATM-Cash-Demand-in-India' },
        ],
        papers: [
            'ATM Cash Demand Forecasting in an Indian Bank with Chaos and Deep Learning — arXiv, 2020',
            'Forecasting ATM Cash Demand Before and During COVID-19 — Springer, 2021',
            'Development of ML-Based Cash Forecasting Models for ATMs — Dergipark, 2024',
            'Statistical and AI-Based Forecasting for ATM Cash Demand — Dergipark, 2024',
        ],
        evaluation: [
            'sMAPE (Symmetric Mean Absolute Percentage Error) — primary metric for comparing accuracy across ATMs',
            'RMSE (Root Mean Square Error) — measures error in actual currency units; heavily penalizes large errors',
            'Time-based validation: walk-forward validation only; random cross-validation is not acceptable',
            'Multi-ATM generalisation: sMAPE difference between training ATMs and new ATMs ≤ 3 percentage points',
            'Forecast horizon stability: sMAPE for 7-day forecasts should not exceed 1-day sMAPE by more than 5 points',
        ],
        minimumScore: 'NN5 Dataset: sMAPE below 20% | Indian RBI Dataset: RMSE around 330',
        dataExplanation: 'Each row is a date and the total cash withdrawn from one ATM on that day. The key patterns: weekends see higher withdrawals, salary dates (1st and 15th) spike demand, and holidays cause sharp fluctuations. The challenge is modelling these irregular events without overfitting to the training period.',
    },
    {
        id: 7,
        title: 'Return Risk Predictor for E-commerce',
        description: 'A gradient-boosted classifier that reads checkout signals — product category, price, customer return history, device type — and predicts at purchase time whether this item will be sent back.',
        longDescription: 'Fashion returns cost retailers over $500 billion every year globally. More than half of all ordered fashion items get returned. Yet most platforms have nothing that warns them at the moment of purchase: "this customer is very likely to return this item." This project builds a model that predicts returns at checkout and suggests lower-risk alternatives.',
        thumbnail: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'Advanced'],
        category: 'Deep Learning',
        views: 5230,
        likes: 388,
        lastUpdated: 'Active',
        techStack: ['Python', 'XGBoost', 'LightGBM', 'Target Encoding', 'SMOTE', 'Scikit-learn', 'Collaborative Filtering'],
        githubUrl: '#',
        featured: false,
        question: 'Can a gradient-boosted tree model (XGBoost or LightGBM), trained on purchase-level features including product category, price, customer past return rate, and order context, predict whether a given online purchase will be returned — achieving AUC-ROC ≥ 0.82 and Precision on the return class ≥ 0.78 — while generalising to product categories it has never seen during training?',
        methodology: [
            'Target label is binary: did this order get returned (1) or not (0)? In UCI Online Retail datasets, invoices starting with "C" indicate cancellations — these are your return labels.',
            'Build features in three groups: (1) Product features — category, price, brand, average rating, number of reviews. (2) Customer features — historical return rate, membership duration, total past orders. (3) Order context — time of day, device type, payment method, discount applied.',
            'Handle product categories using target encoding: replace each category name with its average historical return rate. This avoids exploding feature space while capturing category-level risk.',
            'Handle class imbalance: use scale_pos_weight in XGBoost (ratio of negative to positive samples) or class_weight="balanced" in scikit-learn.',
            'Use time-based splitting: train on orders from months 1–10, test on months 11–12. Never randomly shuffle — that leaks future return patterns.',
            'Build a simple item-based collaborative filtering layer: "this item is high-risk — here are 3 similar items this type of customer typically keeps." This turns prediction into action.',
            'Stress test: train on clothing, test on footwear. If AUC drops more than 8%, the model is too category-specific.',
        ],
        datasets: [
            { name: 'Amazon Reviews 2023 (McAuley Lab)', source: 'HuggingFace', desc: '571M reviews across 33 categories; use low-star reviews with "returned" to construct weak return signal', url: 'https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023' },
            { name: 'UCI Online Retail (2010–2011)', source: 'UCI', desc: '500K+ transactions; invoices starting with "C" are your return labels', url: 'https://archive.ics.uci.edu/dataset/352/online+retail' },
            { name: 'UCI Online Retail II (2009–2011)', source: 'UCI', desc: 'Extended 2-year version; larger, richer, same return labelling scheme', url: 'https://archive.ics.uci.edu/dataset/502/online+retail+ii' },
            { name: 'ASOS GraphReturns Dataset', source: 'OSF', desc: 'Real ASOS purchase + return records with product variant, brand, product type, return labels', url: 'https://osf.io/c793h' },
        ],
        papers: [
            'Early Bird Catches the Worm: Predicting Returns Before Purchase in Fashion E-commerce — arXiv, 2019 (Myntra)',
            'Towards Waste Reduction in E-Commerce: ML for Garment Returns Prediction — SN Computer Science, Springer, 2025',
            'Forecasting E-commerce Consumer Returns: A Systematic Literature Review — Management Review Quarterly, Springer, 2024',
            'A Dataset for Learning Graph Representations to Predict Customer Returns — arXiv, 2023 (ASOS)',
        ],
        evaluation: [
            'AUC-ROC — does the model correctly rank returned orders higher than kept orders? Target ≥ 0.82',
            'Precision on return class — of all orders flagged as returns, what fraction actually were? Target ≥ 0.78',
            'Recall on return class — of all actual returns, what fraction did the model catch? Target ≥ 0.75',
            'Cross-category generalisation: train on clothing, test on footwear. AUC drop ≤ 8 percentage points',
        ],
        minimumScore: 'AUC-ROC ≥ 0.82 | Precision on return class ≥ 0.78 | Recall ≥ 0.75 | Cross-category AUC drop ≤ 8%',
        dataExplanation: 'Each row is one line item in a transaction with product description, quantity, price, customer ID, and country. You pivot this to build a per-order return label and join it with product and customer features. The challenge: only 15–40% of orders are returned — a naive model predicts "no return" for everything and looks 85% accurate but is completely useless.',
    },
    {
        id: 8,
        title: 'RAG-Based Legal QA System for Indian Laws',
        description: 'A Retrieval-Augmented Generation system that retrieves the exact IPC/BNS section or Supreme Court judgment, then summarises it in plain language — cited, verifiable, never hallucinated.',
        longDescription: 'India has over 1,200 central laws, thousands of state laws, and an enormous backlog of court judgments — all in dense legal English. An ordinary citizen cannot understand whether a landlord can evict them or what their rights are under the Consumer Protection Act. This project builds a RAG system that answers legal questions grounded in actual statutory text, not memory.',
        thumbnail: 'https://images.unsplash.com/photo-1589391886645-d51941baf7fb?w=600&h=340&fit=crop',
        tags: ['NLP', 'RAG', 'Advanced'],
        category: 'RAG',
        views: 6120,
        likes: 471,
        lastUpdated: 'Active',
        techStack: ['Python', 'FAISS', 'LangChain', 'Llama-3.1', 'BAAI/bge-m3', 'BERTScore', 'ROUGE'],
        githubUrl: '#',
        featured: true,
        question: 'Can a RAG-based legal QA system — combining FAISS vector retrieval over chunked Indian statutes and Supreme Court judgments with an instruction-tuned LLM — answer 10,000 Indian legal QA questions with faithfulness ≥ 0.85 and ROUGE-L ≥ 0.45, while correctly citing the exact section or judgment that supports each answer?',
        methodology: [
            'Build your knowledge base: collect the Indian Constitution, IPC/BNS sections, CrPC/BNSS, Consumer Protection Act, RTI Act, IT Act, and sample Supreme Court judgments. Split each into ~500 token chunks with 100-token overlap.',
            'Create vector embeddings: use sentence transformer BAAI/bge-m3 to convert each chunk into a dense vector. Store all vectors in a FAISS index — fast, free similarity search from Meta.',
            'Build the retrieval step: convert user question to a vector, search FAISS, retrieve top 5 most relevant legal chunks.',
            'Build the generation step: feed retrieved chunks + question to Llama-3.1 / Gemini Flash with a prompt: "Given this legal text, answer in simple language for a common citizen. Always cite the specific section."',
            'Add faithfulness guard: after generating, run an NLI model to check every claim in the answer traces back to a retrieved chunk.',
            'Add Hindi support: use a multilingual embedding model and allow questions in Hindi. Use a translation or multilingual generation model for Hindi answers.',
        ],
        datasets: [
            { name: 'Indian Supreme Court Judgments', source: 'AWS Open Data', desc: 'Judgments from 1950–2025 in English and regional languages, JSON + Parquet format', url: '#' },
            { name: 'OpenNyAI Legal NLP Toolkit', source: 'GitHub', desc: 'Pre-built NLP pipeline for Indian court judgments; NER, rhetorical role labeling, summarisation', url: 'https://github.com/OpenNyAI' },
            { name: 'Indian SC Judgments Chunked for RAG', source: 'HuggingFace', desc: 'Already chunked (recursive, semantic, token-wise) for RAG use; directly usable', url: '#' },
            { name: 'Indian Legal QA Dataset (10,000 pairs)', source: 'PubMed/Data in Brief', desc: '10,000 QA pairs from 1,256 Supreme Court judgments across criminal and civil cases', url: '#' },
            { name: 'Bharatiya Nyaya Sanhita (BNS) Full Text', source: 'Govt of India MHA', desc: 'Official PDF of India\'s new criminal law replacing IPC; free to use as knowledge base', url: '#' },
        ],
        papers: [
            'LawPal: RAG-Based System for Legal Accessibility in India — arXiv, 2025',
            'LegalEase: RAG Framework for Indian Law — Springer, 2025',
            'NyayaRAG: Legal Judgment Prediction with RAG under Indian Common Law — arXiv, 2025',
            'LegalBench-RAG: Benchmark for RAG in Legal Domain — arXiv, 2024',
            'Legal NLP in India: Comprehensive Survey — Springer AI & Society, 2025',
        ],
        evaluation: [
            'Faithfulness score: does every claim in the generated answer trace back to a retrieved passage? Target ≥ 0.85',
            'ROUGE-L: lexical overlap between generated and ground-truth answers',
            'BERTScore: semantic similarity between generated and ground-truth answers',
            'Citation accuracy: did the system cite the correct section/judgment for each answer?',
            'Out-of-corpus handling: for questions not in the corpus, does the system say "I don\'t know" rather than hallucinating?',
        ],
        minimumScore: 'Faithfulness ≥ 0.85 | ROUGE-L ≥ 0.45 | BERTScore F1 ≥ 0.72 | Citation accuracy ≥ 80%',
        dataExplanation: 'Your knowledge base is a collection of long legal documents — statutes (laws passed by Parliament) and court judgments. The RAG system converts them into searchable ~500-token chunks tagged with source (e.g. "IPC Section 302"). When a user asks a question, the system finds the most relevant chunks and uses them to write a grounded answer.',
    },
    {
        id: 9,
        title: 'RAG Chatbot for Product Q&A',
        description: 'A FAISS-backed RAG shopping assistant that reads product specs and reviews before answering "Is this laptop good for gaming?" — grounded, cited, never generic.',
        longDescription: 'Customers ask questions like "Is this phone camera good in low light?" but existing chatbots give generic responses not grounded in actual product information. This leads to poor decisions and higher return rates. This project builds a knowledgeable shopping assistant that retrieves the exact product specification or review before generating its answer.',
        thumbnail: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600&h=340&fit=crop',
        tags: ['NLP', 'RAG', 'Advanced'],
        category: 'RAG',
        views: 4920,
        likes: 374,
        lastUpdated: 'Active',
        techStack: ['Python', 'FAISS', 'Sentence Transformers', 'Mistral-7B', 'LangChain', 'RAGAS', 'BERTScore'],
        githubUrl: '#',
        featured: false,
        question: 'Can a standard RAG-based system, using a FAISS vector database and an instruction-tuned LLM, retrieve relevant product specifications and reviews to generate accurate, context-aware answers to user queries — achieving BERTScore F1 ≥ 0.80 and Faithfulness ≥ 0.85 — while maintaining response consistency across different product categories?',
        methodology: [
            'Build a Product Knowledge Base: collect product records with structured specs (RAM, battery, material) and unstructured content (titles, descriptions, user reviews) as the retrieval corpus.',
            'Chunk and Embed: split product specs and reviews into meaningful chunks, encode with all-MiniLM-L6-v2, store dense vectors in a FAISS index.',
            'Query-Driven Retrieval: encode the user query into the same vector space, retrieve top-K most relevant chunks using cosine similarity.',
            'Answer Generation: feed retrieved chunks + user query to an instruction-tuned LLM (Mistral-7B or LLaMA-3) with a prompt that instructs the model to answer only from the provided context.',
            'Evaluate using RAGAS framework: measure faithfulness, answer relevance, and context precision independently.',
        ],
        datasets: [
            { name: 'Amazon ESCI Dataset', source: 'GitHub (amazon-science)', desc: '130K unique queries + 2.6M manually labeled query–product relevance judgements', url: 'https://github.com/amazon-science/esci-data' },
            { name: 'AmazonQA Dataset', source: 'GitHub (amazonqa)', desc: '923,000 question-answer pairs grounded in product reviews', url: 'https://github.com/amazonqa/amazonqa' },
            { name: 'WANDS (Wayfair)', source: 'GitHub (wayfair)', desc: '42,994 annotated query–product relevance pairs across furniture and home goods', url: 'https://github.com/wayfair/WANDS' },
        ],
        papers: [
            'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks — arXiv, 2020',
            'RAGAS: Automated Evaluation of Retrieval Augmented Generation — arXiv, 2023',
            'Is Your LLM Secretly a World Model? Evaluating Faithfulness in RAG — arXiv, 2024',
        ],
        evaluation: [
            'BERTScore F1: semantic similarity between generated and reference answers; captures meaning beyond word overlap',
            'Faithfulness: proportion of claims in the answer that are directly supported by retrieved chunks',
            'Answer Relevance: how directly and completely the answer addresses the user\'s question',
            'Context Precision@K: fraction of retrieved chunks that are actually relevant to the query',
        ],
        minimumScore: 'BERTScore F1 ≥ 0.80 | Faithfulness ≥ 0.85 | Answer Relevance ≥ 0.80 | Context Precision@K ≥ 0.75',
        dataExplanation: 'Each product has structured metadata (title, category, specifications) and a collection of user reviews. The evaluation set consists of natural language question–answer pairs where a human has verified the answer is grounded in the product\'s specs or reviews. Faithfulness is evaluated by checking whether each claim in the generated answer can be traced back to a retrieved chunk.',
    },
    {
        id: 10,
        title: 'Zero-Vector Smart Product Search Engine',
        description: 'An intent-aware product search engine that parses "red kurti under 500 for wedding" into structured filters, then retrieves using BM25 — no embeddings, no GPU, ≤ 200ms.',
        longDescription: 'Text search fails on queries like "cheap gaming laptop with good battery" because it cannot interpret multi-constraint intent. Embedding-based vector search is powerful but costly and slow at scale. This project builds a system that parses natural language into structured filters and retrieves results using fast, interpretable classical BM25 — like Elasticsearch, but intent-aware.',
        thumbnail: 'https://images.unsplash.com/photo-1556742111-a301076d9d18?w=600&h=340&fit=crop',
        tags: ['NLP', 'Advanced'],
        category: 'NLP',
        views: 3870,
        likes: 291,
        lastUpdated: 'Active',
        techStack: ['Python', 'BM25', 'spaCy', 'Elasticsearch', 'DuckDB', 'GPT-4o-mini'],
        githubUrl: '#',
        featured: false,
        question: 'Build a system that converts natural language product queries into structured filters (category, price range, color, occasion), then retrieves using BM25 sparse retrieval + hard constraint filtering — achieving Precision@5 ≥ 0.80 and Query Parsing Accuracy ≥ 85%, with end-to-end latency ≤ 200ms.',
        methodology: [
            'Build a Structured Product Catalog: collect product records with title, description, category, price, color, occasion tags, and other attributes.',
            'NLP Query Parsing: use a rule-based and/or lightweight LLM-assisted parser to extract structured constraints from raw queries — price bounds, category, color, occasion, descriptive keywords.',
            'BM25 Sparse Retrieval: index product titles and descriptions using BM25. Retrieve top-N candidate products ranked by BM25 score for the keyword portion of the query.',
            'Structured Constraint Filtering: apply hard filters on top of BM25 results — enforce price range, category match, and attribute constraints — to produce the final ranked list.',
            'Evaluate query parsing accuracy by comparing extracted filter objects against human-annotated ground-truth filters.',
        ],
        datasets: [
            { name: 'Amazon ESCI Dataset', source: 'GitHub (amazon-science)', desc: 'Large-scale benchmark with queries, product metadata, and human relevance judgments', url: 'https://github.com/amazon-science/esci-data' },
            { name: 'Flipkart Product Dataset', source: 'Kaggle', desc: '20,000+ products with titles, descriptions, categories, and prices', url: 'https://kaggle.com/datasets/PromptCloudHQ/flipkart-products' },
            { name: 'Fashion Product Images Dataset', source: 'Kaggle', desc: 'Fashion-focused catalog with category, occasion, color, and price attributes', url: '#' },
            { name: 'MS MARCO Product Queries', source: 'HuggingFace', desc: 'Natural language queries with relevance-labeled passages for benchmarking', url: 'https://huggingface.co/datasets/microsoft/ms_marco' },
        ],
        papers: [
            'Sparse Retrieval: BM25 and Beyond — arXiv, 2020',
            'REALM: Retrieval-Augmented Language Model Pre-Training — arXiv, 2020',
        ],
        evaluation: [
            'Precision@5: fraction of top 5 retrieved products that are genuinely relevant (aim ≥ 0.80)',
            'Query Parsing Accuracy: % of queries where all constraints are correctly extracted (aim ≥ 85%)',
            'End-to-End Latency: total time from raw query to final ranked result (aim ≤ 200ms)',
            'MRR (Mean Reciprocal Rank): how highly the first relevant product is ranked across all queries (aim ≥ 0.75)',
        ],
        minimumScore: 'Precision@5 ≥ 0.80 | Query Parsing Accuracy ≥ 85% | Latency ≤ 200ms | MRR ≥ 0.75',
        dataExplanation: 'Each product has structured metadata: title, category, price, and attribute tags (color: red, occasion: wedding). The evaluation set consists of natural language query–product pairs where a human judged the product to be a relevant match for the expressed constraints. Query parsing accuracy is evaluated by comparing extracted filter objects against human-annotated ground truth.',
    },
    {
        id: 11,
        title: 'Visual Product Matching Assistant',
        description: 'A multimodal RAG system that takes a product image + text query, retrieves visually similar items using a FAISS multimodal index, and explains why each match looks the way it does.',
        longDescription: 'Users discover products on Instagram or in real life but cannot find them online — they cannot accurately describe "that aesthetic beige dress with floral pattern." Current visual search retrieves similar images but doesn\'t explain differences or help users decide. This project builds a system that sees, understands, and explains — like Google Lens but decision-focused.',
        thumbnail: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'Computer Vision', 'Advanced'],
        category: 'Computer Vision',
        views: 4450,
        likes: 333,
        lastUpdated: 'Active',
        techStack: ['Python', 'CLIP', 'ViT', 'FAISS', 'LLaVA', 'BERTScore', 'PyTorch'],
        githubUrl: '#',
        featured: false,
        question: 'Build a system that takes a product image and text query (e.g., "I need this in a smaller size") and retrieves the most visually and semantically similar products from a catalog, generating a human-readable explanation of why they match — achieving Recall@10 ≥ 0.75 and BERTScore F1 ≥ 0.80.',
        methodology: [
            'Build a Multimodal Knowledge Base: collect product images and associated text (title, description, price, category).',
            'Create Multimodal Embeddings: use a Vision Transformer (ViT/CLIP) to convert each product image into a vector; use a text encoder for product text. Combine into a single multimodal embedding per product.',
            'Index and Retrieve: store all embeddings in FAISS. For a user\'s query (image + optional text), convert to multimodal embedding space and retrieve top 10 visually similar products.',
            'Generate Explanation: feed retrieved products and query into a Vision-Language Model (LLaVA or GPT-4V) to generate a natural language explanation of why each product is a good match.',
        ],
        datasets: [
            { name: 'Shopping Queries Image Dataset (SQID)', source: 'Amazon', desc: '190,000+ Amazon products each with title, description, and product image', url: '#' },
            { name: 'MEP-3M', source: 'Academic', desc: '3M image–text pairs across 599 fine-grained product categories', url: '#' },
            { name: 'EcomMMMU', source: 'Academic', desc: '406,190 samples with nearly 9M images across 8 e-commerce tasks', url: '#' },
            { name: 'Amazon ESCI Dataset', source: 'GitHub (amazon-science)', desc: 'Large-scale search benchmark with queries, products, and relevance judgments', url: 'https://github.com/amazon-science/esci-data' },
        ],
        papers: [
            'Beyond Text: Aligning Vision and Language for Multimodal E-Commerce Retrieval — arXiv, 2026',
            'Visiorag: A Multimodal Framework Using Vision Transformers and RAG — IEEE, 2025',
            'MRSE: An Efficient Multi-modality Retrieval System for Large Scale E-commerce — arXiv, 2024',
        ],
        evaluation: [
            'Recall@K (K=10): how often the correct product appears in the top 10 retrieved results (aim ≥ 0.75)',
            'NDCG@K: ranking quality — higher scores for relevant products placed earlier in the list (aim ≥ 0.80)',
            'BERTScore F1: semantic similarity between generated explanation and human-written reference (aim ≥ 0.80)',
            'Faithfulness of Explanation: does the explanation correctly reflect the visual and textual features of the retrieved product? (aim ≥ 0.85)',
        ],
        minimumScore: 'Recall@10 ≥ 0.75 | NDCG@10 ≥ 0.80 | BERTScore F1 ≥ 0.80 | Faithfulness ≥ 0.85',
        dataExplanation: 'Each product has at least one image and textual metadata (title, category, price). The evaluation set consists of query–product pairs where a human judged the product as a relevant match for the query image and/or text. The challenge: the same physical product may appear in different lighting, background, or angles across different catalog entries.',
    },
    {
        id: 12,
        title: 'MCP-Based Customer Support System',
        description: 'A stateful, memory-driven support chatbot using Model Context Protocol — aggregates fragmented histories from email, chat, WhatsApp and CRM, then integrates real-time order status to give consistent, cited answers.',
        longDescription: 'Customer interactions are fragmented across email, live chat, WhatsApp, and CRM systems. Existing chatbots treat each interaction independently — asking users to repeat information every time. MCP (Model Context Protocol) solves this by maintaining a persistent, structured memory of the user across all platforms and integrating real-time transactional data for truly context-aware responses.',
        thumbnail: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=600&h=340&fit=crop',
        tags: ['NLP', 'RAG', 'MCP', 'Advanced'],
        category: 'Agentic AI',
        views: 5680,
        likes: 427,
        lastUpdated: 'Active',
        techStack: ['Node.js', 'TypeScript', 'MCP SDK', 'FAISS', 'Llama-3.1', 'RAGAS', 'ChromaDB'],
        githubUrl: '#',
        featured: true,
        question: 'Can a customer support system built on MCP — aggregating conversation histories across email, chat, and WhatsApp and integrating real-time transactional data — achieve AUC-ROC ≥ 0.85 and answer consistency ≥ 85%, while maintaining hallucination rate ≤ 5% and cross-platform context retention ≥ 80%?',
        methodology: [
            'Set up MCP environment: install Node.js 16.x+ and the MCP SDK (npm install @modelcontextprotocol/sdk). Create an MCP Server that exposes internal systems (order database, CRM) to AI clients via standardized tools.',
            'Create an MCP Server with tools like get_order_status, get_customer_history, and check_refund_status. Use stdio transport for local development, SSE for production.',
            'Build the retrieval step: use FAISS to store embeddings of your knowledge base (FAQs, policies, past tickets). Retrieve top-k most relevant chunks for any user query.',
            'Identity resolution: when a user sends a query from any platform, map their email/phone/account ID to a single customer profile. MCP retrieves all past conversations regardless of platform.',
            'Real-time data fetching: query order management or payment gateway APIs for live status. Feed aggregated context + retrieved knowledge + live data to the LLM.',
            'Faithfulness guard: compare generated answer with previous answers given to the same customer — if they contradict, flag for human review.',
        ],
        datasets: [
            { name: 'WixQA', source: 'HuggingFace', desc: 'Complete KB snapshot + 6,622 QA pairs; all-in-one knowledge base', url: 'https://huggingface.co/datasets/Wix/WixQA' },
            { name: 'Bitext Customer Support LLM Dataset', source: 'HuggingFace', desc: '27,000 intent-tagged interactions for chatbot training', url: 'https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset' },
            { name: 'Customer Support FAQs Dataset', source: 'HuggingFace', desc: '200 FAQs covering returns, payments, and shipping', url: 'https://huggingface.co/datasets/MakTek/Customer_support_faqs_dataset' },
            { name: 'PIISA Customer Tickets Dataset', source: 'HuggingFace', desc: '2,500 structured tickets with type, priority, and status', url: 'https://huggingface.co/datasets/PIISA/dataset' },
        ],
        papers: [
            'Breaking the Protocol: Security Analysis of MCP Specification — arXiv, 2026',
            'RAG-Based Customer Service Chatbot with Knowledge Graph — MDPI Software, 2026',
            'MultiWOZ: Large-Scale Multi-Domain Wizard-of-Oz Dataset — arXiv, 2020',
            'WixQA: Multi-Dataset Benchmark for Enterprise RAG — arXiv, 2025',
        ],
        evaluation: [
            'AUC-ROC: does the model correctly rank relevant answers higher than irrelevant ones? Target ≥ 0.85',
            'Answer consistency: when the same customer asks the same question on two platforms, do answers match? Target ≥ 85%',
            'Hallucination rate: claims not present in retrieved knowledge or live data. Target ≤ 5%',
            'Cross-platform context retention: after moving from chat to email, does the system remember the previous issue? Target ≥ 80%',
            'End-to-end latency: time from query to final answer. Target ≤ 2 seconds for 95% of queries',
        ],
        minimumScore: 'AUC-ROC ≥ 0.85 | Answer consistency ≥ 85% | Hallucination rate ≤ 5% | Cross-platform retention ≥ 80% | p95 latency ≤ 2s',
        dataExplanation: 'Training data has two parts: (1) Conversation logs — sequences of user messages and agent replies, labelled with platform, timestamps, and customer ID. (2) Transactional records — order IDs, payment statuses, refund amounts linked to the same customer ID. The main challenge is joining these two sources without leaking future information.',
    },
    {
        id: 13,
        title: 'Fake News Evolution Tracking System',
        description: 'A multi-agent MCP system that follows a false claim across platforms, pinpoints Patient Zero, maps the amplification network, and assigns a context-aware credibility score to every mutation.',
        longDescription: 'Misinformation doesn\'t stay the same — it mutates as it spreads. A false claim on Twitter becomes embellished on Facebook, then gains authoritative-sounding details on a fringe news site. This project builds a system that tracks these "mutation chains," identifies the original source, visualizes the spread network, and scores credibility based on content, source, and position in the chain.',
        thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=340&fit=crop',
        tags: ['NLP', 'MCP', 'Deep Learning', 'Advanced'],
        category: 'Agentic AI',
        views: 5100,
        likes: 398,
        lastUpdated: 'Active',
        techStack: ['Python', 'Node.js', 'MCP SDK', 'BERT', 'NetworkX', 'FAISS', 'spaCy'],
        githubUrl: '#',
        featured: false,
        question: 'How to automatically detect and visualize "mutation chains" of fake news narratives as they evolve across different platforms and time, using evolutionary context to generate more accurate credibility scores — achieving mutation chain detection accuracy > 90%, Patient Zero identification > 85%, and credibility score correlation Pearson\'s r > 0.85?',
        methodology: [
            'Set up Anti-Bullshit MCP Server (Node.js 18+) that can analyze claims, validate sources, and detect manipulation tactics like emotional manipulation or urgency creation.',
            'Agent 1 — Data Collector: pulls news articles and social media posts from your datasets across platforms.',
            'Agent 2 — Narrative Tracker: uses BERT embeddings to find semantically similar articles and group them into story mutation chains. Identifies "Patient Zero" by finding the earliest version.',
            'Agent 3 — Propagation Mapper: analyzes the social graph (retweets, shares, user relationships) to map how the story spread and calculates misinformation propagation rate.',
            'Agent 4 — Credibility Scorer: assigns scores based on (1) content factual accuracy, (2) source trustworthiness, and (3) context — position in the mutation chain (version 5 is likely less reliable than version 1).',
            'MCP Shared Context: all four agents share a live understanding — Agent 1\'s new article automatically updates Agent 2\'s mutation map, which triggers Agent 4 to recalculate credibility scores.',
        ],
        datasets: [
            { name: 'FakeNewsNet', source: 'GitHub (KaiDMML)', desc: 'Multi-dimensional repository with news content, social context, and spatiotemporal info per story', url: 'https://github.com/KaiDMML/FakeNewsNet' },
            { name: 'LIAR / LIAR2 Dataset', source: 'HuggingFace', desc: '12.8K–23K human-labeled statements with fine-grained truth labels (pants-fire → true)', url: 'https://huggingface.co/datasets/ucsbnlp/liar' },
        ],
        papers: [
            'MCP-Orchestrated Multi-Agent System for Automated Disinformation Detection — arXiv, 2025',
            'Finding Patient Zero and Tracking Narrative Changes Using Semantic Similarity — Stanford/DOJ, 2024',
            'Simulating Misinformation Propagation in Social Networks Using LLMs — arXiv, 2025',
            'Fact-Checking at Scale: Multimodal AI for Authenticity Verification — arXiv, 2025',
        ],
        evaluation: [
            'Mutation Chain Detection Accuracy: manually review known fake news stories; did the system correctly group all versions? Target > 90%',
            'Patient Zero Identification: is the earliest post in the chain truly the first known instance? Target > 85%',
            'Credibility Score Correlation: compare scores against LIAR human fact-checker labels. Pearson\'s r > 0.85',
            'System Performance: time to process a chain of 100 articles. Target < 5 minutes per chain',
        ],
        minimumScore: 'Mutation chain accuracy > 90% | Patient Zero identification > 85% | Credibility score Pearson\'s r > 0.85 | < 5 min per chain',
        dataExplanation: 'FakeNewsNet includes news content (headline, body text, images), social context (user profiles, follower graphs, tweet metadata), and labels. LIAR provides 12–23K short statements labeled by professional fact-checkers with fine-grained truthfulness labels from "pants-fire" to "true." Together they cover both the social spread dynamics and the factual accuracy scoring dimensions of this problem.',
    },
    {
        id: 14,
        title: 'Data Analyst Agent (Business Intelligence)',
        description: 'An agentic AI pipeline that takes any CSV, infers schema, generates and runs analytical queries, builds charts, and writes a plain-English executive summary — fully automated, end-to-end.',
        longDescription: 'Business analysts spend hours manually cleaning spreadsheets, writing SQL, and building charts. Non-technical stakeholders have no way to query their own data without a data engineer. This project builds an AI agent that takes a raw CSV, automatically understands the data, plans and executes relevant queries, generates visualizations, and writes a business summary — all in under 60 seconds.',
        thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=340&fit=crop',
        tags: ['Deep Learning', 'Agentic AI', 'Advanced'],
        category: 'Agentic AI',
        views: 5840,
        likes: 449,
        lastUpdated: 'Active',
        techStack: ['Python', 'DuckDB', 'Pandas', 'Plotly', 'GPT-4o-mini', 'LangChain', 'Matplotlib'],
        githubUrl: '#',
        featured: true,
        question: 'Can an agentic AI pipeline — combining data profiling, LLM-powered query planning, Pandas/DuckDB execution, chart generation, and final insight writing — produce accurate business summaries from arbitrary CSV inputs, achieving column-type inference accuracy ≥ 90%, query relevance score ≥ 0.80, and chart appropriateness score ≥ 0.85, in under 60 seconds on datasets up to 100,000 rows?',
        methodology: [
            'Data Understanding: user uploads CSV. A profiling agent reads with Pandas and infers column types (categorical, numeric, datetime, text), detects nulls, outliers, and cardinality. Produces structured schema summary.',
            'Query Planner: pass schema summary to LLM with a structured prompt: "Generate 5–8 SQL-like analytical queries that would produce the most useful business insights." Output as JSON list.',
            'Execution: run each query using DuckDB (in-memory SQL that reads Pandas DataFrames). Clean data first: impute/drop nulls, normalize string casing, parse date columns.',
            'Visualization: for each result table, a second LLM call determines the best chart type (bar, line, scatter, pie, heatmap). Generate with Plotly, annotate with LLM-generated titles and axis labels.',
            'Insight Generator: pass all query results and chart descriptions to a final LLM: "Write a concise executive summary covering key trends, anomalies, top performers, and 3 actionable recommendations."',
            'Evaluate on benchmark CSV datasets (Kaggle retail, HR, financial) with known ground-truth insights.',
        ],
        datasets: [
            { name: 'E-Commerce Data (UK Online Retail)', source: 'Kaggle', desc: 'Real transaction data from a UK-based e-commerce store (orders, customers, products, timestamps)', url: '#' },
            { name: 'Superstore Sales Dataset', source: 'Kaggle', desc: 'Sales, profit, customer segments, shipping, regional data — great for business analytics', url: '#' },
            { name: 'UCI Machine Learning Repository', source: 'UCI', desc: 'Classic structured datasets (adult income, bank marketing) with well-understood ground truth', url: 'https://archive.ics.uci.edu' },
            { name: 'NYC Open Data', source: 'NYC Open Data', desc: 'Large, messy real-world tabular datasets with nulls, mixed types, and complex schemas', url: 'https://opendata.cityofnewyork.us' },
        ],
        papers: [
            'Data-Copilot: Bridging Billions of Data and Humans with Autonomous Workflow — arXiv, 2023',
            'TableGPT: Towards Unifying Tables, Natural Language and Commands — arXiv, 2023',
            'LIDA: Automatic Generation of Grammar-Agnostic Visualizations Using LLMs — arXiv, 2023',
            'Agentic AI: Comprehensive Survey of Architectures and Applications — arXiv, 2025',
        ],
        evaluation: [
            'Column-type inference accuracy: did the agent correctly identify numeric vs categorical vs datetime? (aim ≥ 90%)',
            'Query relevance score: human-rated 1–5 — did LLM-generated queries surface the most meaningful questions? (aim ≥ 4.0)',
            'Chart appropriateness score: did the agent pick the right chart type for each result? (aim ≥ 85%)',
            'Insight accuracy: did the summary correctly identify top trends and outliers present in the data? (aim ≥ 80%)',
            'Hallucination rate: did the summary contain any claims not supported by actual query results? (aim ≤ 5%)',
            'End-to-end latency: full pipeline under 60 seconds for 100,000-row CSV',
        ],
        minimumScore: 'Column-type accuracy ≥ 90% | Query relevance ≥ 4.0/5.0 | Chart appropriateness ≥ 85% | Insight accuracy ≥ 80% | Hallucination ≤ 5% | Latency ≤ 60s',
        dataExplanation: 'Evaluated on CSV files of varying complexity: a simple HR dataset (employee ID, department, salary) tests basic aggregation; a retail sales dataset (product, date, region, revenue) tests trend detection; a financial dataset with nulls and outliers tests the cleaning stage. Ground-truth insights from existing analyses allow evaluation of whether the agent discovers the same key findings.',
    },
    {
        id: 15,
        title: 'AI Meeting Assistant with Action Tracking',
        description: 'A Whisper + LLM agentic pipeline that transcribes meetings, extracts action items with assignee and deadline, posts tasks to Trello/Notion automatically, and sends reminders before every deadline.',
        longDescription: 'The average knowledge worker spends 4–6 hours per week in meetings. Tasks get assigned verbally but never written down. Two weeks later, someone asks "what happened to that deliverable?" and no one can answer. This project builds an AI agent that transcribes in real time, extracts action items, posts them to a task manager, and follows up automatically.',
        thumbnail: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&h=340&fit=crop',
        tags: ['NLP', 'Agentic AI', 'Advanced'],
        category: 'Agentic AI',
        views: 6450,
        likes: 502,
        lastUpdated: 'Active',
        techStack: ['Python', 'Whisper (OpenAI)', 'pyannote.audio', 'GPT-4o-mini', 'LangChain', 'Trello API', 'Slack API'],
        githubUrl: '#',
        featured: true,
        question: 'Can an agentic AI pipeline — combining Whisper ASR, speaker diarisation, LLM-based structured extraction, and tool-use for posting to Trello/Notion — extract action items from meeting transcripts with entity-level F1 ≥ 0.80 on the AMI benchmark, while achieving assignee accuracy ≥ 85% and deadline attribution error < 15%?',
        methodology: [
            'Transcribe the meeting: feed audio (MP3/WAV) into OpenAI Whisper (free, open-source). Whisper outputs a timestamped transcript: each line has words and the time they were said.',
            'Assign speakers: use pyannote.audio speaker diarisation to label who said what. Each line becomes: "Speaker 2 [14:32]: Can you finish the report by Friday?"',
            'Extract action items with LLM: pass transcript chunks to GPT-4o-mini/Llama-3.1 with a structured prompt: "Extract all action items with task description, responsible person, and deadline. Output as JSON."',
            'Build an agentic loop: the agent has tools — post_task(task, assignee, deadline) → calls Trello/Notion/Asana API; send_reminder(person, task, deadline) → sends Slack/email message.',
            'Follow-up agent: a scheduled agent checks every 24 hours before a deadline. If a task is not marked complete, it sends a personalised reminder to the assignee.',
            'Evaluate on AMI corpus: compare extracted items against ground-truth action item annotations using entity-level F1.',
        ],
        datasets: [
            { name: 'AMI Meeting Corpus (Official)', source: 'Edinburgh', desc: '100 hours of meeting recordings with manual transcription, speaker labels, and action item annotations', url: 'https://groups.inf.ed.ac.uk/ami/corpus' },
            { name: 'AMI Corpus (HuggingFace)', source: 'HuggingFace', desc: 'Same AMI dataset pre-formatted for HuggingFace; 279 meetings, load in one line', url: 'https://huggingface.co/datasets/edinburghcstr/ami' },
            { name: 'AMI + ICSI in JSON Format', source: 'GitHub', desc: 'Pre-processed JSON format with summaries, speaker turns, dialogue acts, and annotations', url: '#' },
            { name: 'ICSI Meeting Corpus', source: 'Edinburgh (Official)', desc: '70 hours of real research meeting recordings from ICSI Berkeley; complements AMI', url: '#' },
        ],
        papers: [
            'Summaries, Highlights, and Action Items: LLM-Powered Meeting Recap — arXiv/ACM CSCW, 2025 (Microsoft)',
            'Action-Item-Driven Summarization of Long Meeting Transcripts — arXiv, 2023',
            'Agentic AI: Comprehensive Survey of Architectures, Applications — arXiv, 2025',
            'Large Language Models for Generative Information Extraction — Springer, 2024',
        ],
        evaluation: [
            'Action item F1: did the extracted task match the gold annotation? (Precision + Recall combined)',
            'Assignee accuracy: when a person was named as responsible, did the model correctly identify them? (aim ≥ 85%)',
            'Deadline attribution error: when a deadline was mentioned, was it correctly extracted? (aim ≤ 15%)',
            'End-to-end pipeline test: for a new meeting recording, does the full system (transcribe → extract → post to Trello) work without human correction? (aim ≥ 90%)',
            'Follow-up effectiveness: did the agent correctly identify overdue tasks and send the right reminder?',
        ],
        minimumScore: 'Action Item F1 ≥ 0.80 on AMI | Assignee accuracy ≥ 85% | Deadline error ≤ 15% | ≥ 90% tasks correctly posted',
        dataExplanation: 'Each AMI meeting is a ~30-minute recording of 4 people on a design project. The corpus provides audio files, word-level transcripts with timestamps, speaker labels, topic segmentation, and manually annotated action items (who was asked to do what). The ICSI corpus adds naturally occurring academic research meetings — more diverse and harder than scripted AMI meetings.',
    },
];

// Tag + Category Config
const ALL_TAGS = [
    'NLP', 'Deep Learning', 'Computer Vision', 'GNN',
    'BERT', 'LSTM', 'Document AI', 'LayoutLM',
    'Bioinformatics', 'EdTech', 'Time Series',
    'RAG', 'MCP', 'Agentic AI', 'Advanced',
];

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest First' },
    { value: 'popular', label: 'Most Popular' },
    { value: 'views', label: 'Most Viewed' },
    { value: 'likes', label: 'Most Liked' },
];

// Tag Colour Map
const TAG_COLORS = {
    'NLP':                { bg: 'rgba(63,169,201,0.12)',   text: '#5fc4dd', border: 'rgba(63,169,201,0.3)'  },
    'Deep Learning':      { bg: 'rgba(145,128,232,0.12)',  text: '#ab9df0', border: 'rgba(145,128,232,0.3)' },
    'Computer Vision':    { bg: 'rgba(93,142,222,0.12)',  text: '#60a5fa', border: 'rgba(93,142,222,0.3)' },
    'GNN':                { bg: 'rgba(65,189,120,0.12)',  text: '#34d399', border: 'rgba(65,189,120,0.3)' },
    'BERT':               { bg: 'rgba(102,114,224,0.12)',  text: '#98a0ed', border: 'rgba(102,114,224,0.3)' },
    'LSTM':               { bg: 'rgba(236,72,153,0.12)',  text: '#dd9ec4', border: 'rgba(236,72,153,0.3)' },
    'Document AI':        { bg: 'rgba(249,115,22,0.12)',  text: '#e09a5e', border: 'rgba(249,115,22,0.3)' },
    'LayoutLM':           { bg: 'rgba(234,179,8,0.12)',   text: '#fbbf24', border: 'rgba(234,179,8,0.3)'  },
    'Bioinformatics':     { bg: 'rgba(65,189,120,0.12)',   text: '#4ade80', border: 'rgba(65,189,120,0.3)'  },
    'EdTech':             { bg: 'rgba(251,191,36,0.12)',  text: '#fcd34d', border: 'rgba(251,191,36,0.3)' },
    'Advanced':           { bg: 'rgba(224,102,97,0.12)',   text: '#f87171', border: 'rgba(224,102,97,0.3)'  },
    'PyTorch':            { bg: 'rgba(224,102,97,0.12)',   text: '#f87171', border: 'rgba(224,102,97,0.3)'  },
    'Time Series':        { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.3)'  },
    'RAG':                { bg: 'rgba(168,85,247,0.12)',  text: '#b39ae8', border: 'rgba(168,85,247,0.3)'  },
    'MCP':                { bg: 'rgba(224,160,80,0.12)',  text: '#fbbf24', border: 'rgba(224,160,80,0.3)'  },
    'Agentic AI':         { bg: 'rgba(34,211,238,0.12)',  text: '#8ed3e3', border: 'rgba(34,211,238,0.3)'  },
};

function getTagStyle(tag) {
    return TAG_COLORS[tag] || { bg: 'rgba(161,161,170,0.12)', text: '#a1a1aa', border: 'rgba(161,161,170,0.3)' };
}

// Stat Formatter
function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

// Tag Pill
function TagPill({ tag, small = false, clickable = false, active = false, onClick }) {
    const s = getTagStyle(tag);
    return (
        <button
            onClick={onClick}
            style={{
                background:   active ? s.text + '22' : s.bg,
                color:        s.text,
                border:       `1px solid ${active ? s.text : s.border}`,
                fontSize:     small ? '0.68rem' : '0.72rem',
                padding:      small ? '2px 8px' : '3px 10px',
                borderRadius: 999,
                fontWeight:   600,
                letterSpacing: '0.02em',
                cursor:       clickable ? 'pointer' : 'default',
                transition:   'all 0.15s',
                outline:      'none',
                whiteSpace:   'nowrap',
                transform:    active ? 'scale(1.03)' : 'scale(1)',
            }}
        >
            {tag}
        </button>
    );
}

// Category icons for the shared ShowcaseCard
const CATEGORY_ICONS = {
    'NLP':                   MessageSquare,
    'Graph Neural Networks': Cpu,
    'Deep Learning':         Brain,
    'Computer Vision':       Eye,
    'Document AI':           FileText,
    'Time Series':           BarChart2,
    'RAG':                   Database,
    'Agentic AI':            Sparkles,
};
function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || FlaskConical;
}

// ProjectModal replaced by full-screen ProjectDetail (see ProjectDetail.jsx)

// Main Component
export default function Project() {
    const { isDark } = useTheme();
    const [search, setSearch]           = useState('');
    const [activeTags, setActiveTags]   = useState([]);
    const [sortBy, setSortBy]           = useState('newest');
    const [selectedProject, setSelectedProject] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const searchRef = useRef(null);

    // Keyboard shortcut: Cmd/Ctrl+K → focus search
    useEffect(() => {
        const handler = e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Toggle tag filter
    const toggleTag = tag => {
        setActiveTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // Filtered + sorted projects
    const filtered = useMemo(() => {
        let list = PROJECTS_DATA;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                p.tags.some(t => t.toLowerCase().includes(q)) ||
                p.techStack.some(t => t.toLowerCase().includes(q))
            );
        }
        if (activeTags.length > 0) {
            list = list.filter(p => activeTags.every(t => p.tags.includes(t)));
        }
        switch (sortBy) {
            case 'popular': return [...list].sort((a, b) => (b.views + b.likes * 3) - (a.views + a.likes * 3));
            case 'views':   return [...list].sort((a, b) => b.views - a.views);
            case 'likes':   return [...list].sort((a, b) => b.likes - a.likes);
            default:        return list; // newest = original order
        }
    }, [search, activeTags, sortBy]);

    const accentGrad = 'linear-gradient(135deg,#6672e0,#9180e8)';

    return (
        <div className="text-foreground" style={{
            height: '100%', overflowY: 'auto', backgroundColor: 'var(--color-app-bg)',
            fontFamily: 'Geist, Inter, sans-serif',
        }}>

            {/* Hero Section */}
            <div className="relative overflow-hidden border-b bg-card dark:bg-background border-black/[0.06] dark:border-white/[0.06]" style={{minHeight:'340px'}}>
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{backgroundImage:'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',backgroundSize:'44px 44px',maskImage:'radial-gradient(circle at center, black 20%, transparent 90%)'}} />

                <div className="relative z-10 text-center px-6 pt-12 pb-10 max-w-4xl mx-auto">
                    {/* Pill badge */}
                    <div className="page-hero-badge">
                        <Sparkles size={10} style={{ color: '#3fa9c9' }} />
                        AI Research Projects
                    </div>

                    {/* Title */}
                    <h1 className="text-5xl md:text-[3.75rem] font-black tracking-tight leading-none courses-hero-title-grad mb-3">
                        Projects
                    </h1>

                    <p className="page-hero-sub">
                        Build real AI systems — from NLP and computer vision to data science and beyond.
                    </p>

                    {/* Stat chips */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {[
                            { icon: <Brain size={13} />,   label: `${PROJECTS_DATA.length} Projects` },
                            { icon: <Target size={13} />,  label: `${ALL_TAGS.filter(t=>t!=='Advanced').length} Topics` },
                            { icon: <Eye size={13} />,     label: `${fmtNum(PROJECTS_DATA.reduce((s,p)=>s+p.views,0))} Views` },
                            { icon: <Star size={13} />,    label: `${PROJECTS_DATA.filter(p=>p.featured).length} Featured` },
                        ].map(({ icon, label }) => (
                            <div key={label} className="page-hero-chip">
                                <span>{icon}</span>
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="page-container" style={{ padding: '32px 24px 64px' }}>
                {/* Left: projects grid */}
                <div>
                    {/* Reset row */}
                    {(search || activeTags.length > 0) && (
                        <div className="flex items-center mb-4">
                            <button
                                onClick={() => { setSearch(''); setActiveTags([]); }}
                                className="text-[0.72rem] font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Reset Filters
                            </button>
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className="mb-7 relative">
                        <div className={`p-[2px] rounded-2xl transition-all duration-300 ${
                            search
                                ? 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-violet-500 bg-[length:300%] animate-[searchGradient_3s_linear_infinite] shadow-[0_8px_32px_-8px_rgba(63,169,201,0.3)]'
                                : 'bg-border'
                        }`}>
                            <div className={`flex items-center rounded-[14px] px-5 py-3 ${
                                isDark ? 'bg-[#14161d]' : 'bg-white'
                            }`}>
                                <Search size={18} className={`flex-shrink-0 transition-colors duration-300 ${search ? 'text-cyan-400' : 'text-muted-foreground/50'}`}/>
                                <input
                                    ref={searchRef}
                                    className="flex-1 px-4 bg-transparent border-none outline-none text-[0.95rem] search-focus text-foreground placeholder:text-muted-foreground/40"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search projects, tags, tech stack..."
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="ml-3 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all hover:scale-110">
                                        <X size={12}/>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Grid */}
                    {filtered.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" style={{ gridAutoRows: '1fr' }}>
                            {filtered.map((project, idx) => (
                                <ShowcaseCard
                                    key={project.id}
                                    index={idx}
                                    icon={getCategoryIcon(project.category)}
                                    title={project.title}
                                    tagline={project.category}
                                    description={project.description}
                                    chips={[
                                        { icon: Eye, label: fmtNum(project.views) },
                                        { icon: Heart, label: fmtNum(project.likes) },
                                        { icon: Clock, label: project.lastUpdated },
                                    ]}
                                    actions={[{ icon: ArrowUpRight, label: 'View', onClick: () => setSelectedProject(project) }]}
                                    onClick={() => setSelectedProject(project)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 rounded-3xl border bg-card border-border">
                            <div className="text-5xl mb-4">🔍</div>
                            <h3 className="text-lg font-extrabold mb-2 text-foreground">No projects found</h3>
                            <p className="text-[0.9rem] mb-5 text-muted-foreground">Try adjusting your search or filters</p>
                            <button
                                onClick={() => { setSearch(''); setActiveTags([]); }}
                                className="px-6 py-2.5 rounded-xl font-bold text-[0.85rem] text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {selectedProject && (
                <ProjectDetail
                    project={selectedProject}
                    isDark={isDark}
                    onClose={() => setSelectedProject(null)}
                />
            )}
        </div>
    );
}
