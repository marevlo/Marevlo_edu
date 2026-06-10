import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    BookOpen, ChevronLeft, ChevronRight, ChevronDown,
    CheckCircle2, Circle, Clock, ArrowLeft, ArrowUpRight, Brain, Search,
    Menu, X, Maximize2, Minimize2,
} from 'lucide-react';
import ReactDOM from 'react-dom';
import parse from 'html-react-parser';
import { useTheme } from '../context/ThemeContext';

//  HTML FILE MAP
//  Maps lesson ID → public path to HTML file

const RESEARCH_HTML_MAP = {
    // Agentic Search
    'as-m0': '/Research-courses/Agentic Search/Agentic Search/M0_what_makes_search_agentic.html',
    'as-m1': '/Research-courses/Agentic Search/Agentic Search/M1_search_tool_design.html',
    'as-m2': '/Research-courses/Agentic Search/Agentic Search/M2_multi_step_retrieval_planning.html',
    'as-m3': '/Research-courses/Agentic Search/Agentic Search/M3_web_search_integration.html',
    'as-m4': '/Research-courses/Agentic Search/Agentic Search/M4_structured_and_code_search.html',
    'as-m5': '/Research-courses/Agentic Search/Agentic Search/M5_search_evaluation_and_reliability.html',
    'as-m6': '/Research-courses/Agentic Search/Agentic Search/M6_production_agentic_search_systems.html',

    // Context Engineering
    'ce-m0': '/Research-courses/Context engineering/Context engineering/T2_M0_context_window_as_resource.html',
    'ce-m1': '/Research-courses/Context engineering/Context engineering/T2_M1_information_architecture.html',
    'ce-m2': '/Research-courses/Context engineering/Context engineering/T2_M2_dynamic_context_assembly.html',
    'ce-m3': '/Research-courses/Context engineering/Context engineering/T2_M3_system_prompt_engineering.html',
    'ce-m4': '/Research-courses/Context engineering/Context engineering/T2_M4_few_shot_in_context_learning.html',
    'ce-m5': '/Research-courses/Context engineering/Context engineering/T2_M5_memory_systems.html',
    'ce-m6': '/Research-courses/Context engineering/Context engineering/T2_M6_multimodal_context.html',
    'ce-m7': '/Research-courses/Context engineering/Context engineering/T2_M7_context_for_agents_and_tools.html',
    'ce-m8': '/Research-courses/Context engineering/Context engineering/T2_M8_evaluation_and_optimization.html',

    // Recommender System — Conceptual (34 modules)
    'rs2-m01': '/Research-courses/Recommender system 2/T3_M01_you_already_use_recsys.html',
    'rs2-m02': '/Research-courses/Recommender system 2/T3_M02_four_eras.html',
    'rs2-m03': '/Research-courses/Recommender system 2/T3_M03_data_lies.html',
    'rs2-m04': '/Research-courses/Recommender system 2/T3_M04_six_problems.html',
    'rs2-m05': '/Research-courses/Recommender system 2/T3_M05_answer_these.html',
    'rs2-m06': '/Research-courses/Recommender system 2/T3_M06_first_recommender.html',
    'rs2-m07': '/Research-courses/Recommender system 2/T3_M07_content_based.html',
    'rs2-m08': '/Research-courses/Recommender system 2/T3_M08_collaborative_filtering.html',
    'rs2-m09': '/Research-courses/Recommender system 2/T3_M09_item_knn.html',
    'rs2-m10': '/Research-courses/Recommender system 2/T3_M10_similarity_metrics.html',
    'rs2-m11': '/Research-courses/Recommender system 2/T3_M11_knn_bug.html',
    'rs2-m12': '/Research-courses/Recommender system 2/T3_M12_user_knn.html',
    'rs2-m13': '/Research-courses/Recommender system 2/T3_M13_hybrid.html',
    'rs2-m14': '/Research-courses/Recommender system 2/T3_M14_mf_decomposition.html',
    'rs2-m15': '/Research-courses/Recommender system 2/T3_M15_funksvd.html',
    'rs2-m16': '/Research-courses/Recommender system 2/T3_M16_bpr.html',
    'rs2-m17': '/Research-courses/Recommender system 2/T3_M17_wrmf.html',
    'rs2-m18': '/Research-courses/Recommender system 2/T3_M18_mf_variants.html',
    'rs2-m19': '/Research-courses/Recommender system 2/T3_M19_features_fm.html',
    'rs2-m20': '/Research-courses/Recommender system 2/T3_M20_wide_deep.html',
    'rs2-m21': '/Research-courses/Recommender system 2/T3_M21_ranking_layer.html',
    'rs2-m22': '/Research-courses/Recommender system 2/T3_M22_sasrec.html',
    'rs2-m23': '/Research-courses/Recommender system 2/T3_M23_lightgcn.html',
    'rs2-m24': '/Research-courses/Recommender system 2/T3_M24_llm_recsys.html',
    'rs2-m25': '/Research-courses/Recommender system 2/T3_M25_ncf.html',
    'rs2-m26': '/Research-courses/Recommender system 2/T3_M26_model_zoo.html',
    'rs2-m27': '/Research-courses/Recommender system 2/T3_M27_full_stack.html',
    'rs2-m28': '/Research-courses/Recommender system 2/T3_M28_serving.html',
    'rs2-m29': '/Research-courses/Recommender system 2/T3_M29_ab_testing.html',
    'rs2-m30': '/Research-courses/Recommender system 2/T3_M30_feedback_loops.html',
    'rs2-m31': '/Research-courses/Recommender system 2/T3_M31_mlops.html',
    'rs2-m32': '/Research-courses/Recommender system 2/T3_M32_capstone_retrieval.html',
    'rs2-m33': '/Research-courses/Recommender system 2/T3_M33_capstone_ranking.html',
    'rs2-m34': '/Research-courses/Recommender system 2/T3_M34_capstone_finale.html',

    // Recommender System — Deep Dive (30 modules)
    'rs2-d01': '/Research-courses/Recommender system 2/T3_DEEP_M01.html',
    'rs2-d02': '/Research-courses/Recommender system 2/T3_DEEP_M02.html',
    'rs2-d03': '/Research-courses/Recommender system 2/T3_DEEP_M03.html',
    'rs2-d04': '/Research-courses/Recommender system 2/T3_DEEP_M04.html',
    'rs2-d05': '/Research-courses/Recommender system 2/T3_DEEP_M05.html',
    'rs2-d06': '/Research-courses/Recommender system 2/T3_DEEP_M06.html',
    'rs2-d07': '/Research-courses/Recommender system 2/T3_DEEP_M07.html',
    'rs2-d08': '/Research-courses/Recommender system 2/T3_DEEP_M08.html',
    'rs2-d09': '/Research-courses/Recommender system 2/T3_DEEP_M09.html',
    'rs2-d10': '/Research-courses/Recommender system 2/T3_DEEP_M10.html',
    'rs2-d11': '/Research-courses/Recommender system 2/T3_DEEP_M11.html',
    'rs2-d12': '/Research-courses/Recommender system 2/T3_DEEP_M12.html',
    'rs2-d13': '/Research-courses/Recommender system 2/T3_DEEP_M13.html',
    'rs2-d14': '/Research-courses/Recommender system 2/T3_DEEP_M14.html',
    'rs2-d15': '/Research-courses/Recommender system 2/T3_DEEP_M15.html',
    'rs2-d16': '/Research-courses/Recommender system 2/T3_DEEP_M16.html',
    'rs2-d17': '/Research-courses/Recommender system 2/T3_DEEP_M17.html',
    'rs2-d18': '/Research-courses/Recommender system 2/T3_DEEP_M18.html',
    'rs2-d19': '/Research-courses/Recommender system 2/T3_DEEP_M19.html',
    'rs2-d20': '/Research-courses/Recommender system 2/T3_DEEP_M20.html',
    'rs2-d21': '/Research-courses/Recommender system 2/T3_DEEP_M21.html',
    'rs2-d22': '/Research-courses/Recommender system 2/T3_DEEP_M22.html',
    'rs2-d23': '/Research-courses/Recommender system 2/T3_DEEP_M23.html',
    'rs2-d24': '/Research-courses/Recommender system 2/T3_DEEP_M24.html',
    'rs2-d25': '/Research-courses/Recommender system 2/T3_DEEP_M25.html',
    'rs2-d26': '/Research-courses/Recommender system 2/T3_DEEP_M26.html',
    'rs2-d27': '/Research-courses/Recommender system 2/T3_DEEP_M27.html',
    'rs2-d28': '/Research-courses/Recommender system 2/T3_DEEP_M28.html',
    'rs2-d29': '/Research-courses/Recommender system 2/T3_DEEP_M29.html',
    'rs2-d30': '/Research-courses/Recommender system 2/T3_DEEP_M30.html',

    // Recommender System — Labs (6 modules)
    'rs2-l01': '/Research-courses/Recommender system 2/Lab_01_interaction_matrix.html',
    'rs2-l02': '/Research-courses/Recommender system 2/Lab_02_popularity_cbf.html',
    'rs2-l03': '/Research-courses/Recommender system 2/Lab_03_item_knn_shrinkage.html',
    'rs2-l04': '/Research-courses/Recommender system 2/Lab_04_bpr_mf.html',
    'rs2-l05': '/Research-courses/Recommender system 2/Lab_05_faiss_serving.html',
    'rs2-l06': '/Research-courses/Recommender system 2/Lab_06_capstone_pipeline.html',

};

//  SIDEBAR CONFIGS — metadata for each lesson

const RESEARCH_COURSE_CONFIGS = {
    // Agentic Search
    'as-m0': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'What Makes Search Agentic?',
        duration: '~25m',
        level: 'Beginner',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m1': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Search Tool Design',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m2': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Multi-Step Retrieval Planning',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m3': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Web Search Integration',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m4': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Structured & Code Search',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m5': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Search Evaluation & Reliability',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },
    'as-m6': {
        courseId: 'agentic-search',
        courseLabel: 'Agentic Search',
        title: 'Production Agentic Search Systems',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['as-m0','as-m1','as-m2','as-m3','as-m4','as-m5','as-m6'],
    },

    // Context Engineering
    'ce-m0': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Context Window as Resource',
        duration: '~25m',
        level: 'Beginner',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m1': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Information Architecture',
        duration: '~25m',
        level: 'Beginner',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m2': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Dynamic Context Assembly',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m3': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'System Prompt Engineering',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m4': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Few-Shot & In-Context Learning',
        duration: '~25m',
        level: 'Intermediate',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m5': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Memory Systems',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m6': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Multimodal Context',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m7': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Context for Agents & Tools',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },
    'ce-m8': {
        courseId: 'context-engineering',
        courseLabel: 'Context Engineering',
        title: 'Evaluation & Optimization',
        duration: '~25m',
        level: 'Advanced',
        siblings: ['ce-m0','ce-m1','ce-m2','ce-m3','ce-m4','ce-m5','ce-m6','ce-m7','ce-m8'],
    },

    // Recommender System — Conceptual
    'rs2-m01': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'You Already Use Recsys', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m02': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Four Eras of Recsys', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m03': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Data Lies', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m04': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Six Problems', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m05': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Answer These', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m06': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'First Recommender', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m07': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Content Based', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m08': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Collaborative Filtering', duration: '~3h', level: 'Beginner', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m09': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Item kNN', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m10': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Similarity Metrics', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m11': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'kNN Bug', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m12': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'User kNN', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m13': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Hybrid', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m14': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'MF Decomposition', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m15': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'FunkSVD', duration: '~3h', level: 'Intermediate', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m16': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'BPR', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m17': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'WRMF', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m18': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'MF Variants', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m19': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Features FM', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m20': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Wide & Deep', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m21': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Ranking Layer', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m22': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'SASRec', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m23': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'LightGCN', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m24': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'LLM Recsys', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m25': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'NCF', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m26': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Model Zoo', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m27': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Full Stack', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m28': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Serving', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m29': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'A/B Testing', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m30': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Feedback Loops', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m31': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'MLOps', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m32': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Capstone: Retrieval', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m33': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Capstone: Ranking', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },
    'rs2-m34': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Capstone: Finale', duration: '~3h', level: 'Advanced', siblings: ['rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10','rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20','rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30','rs2-m31','rs2-m32','rs2-m33','rs2-m34'] },

    // Recommender System — Deep Dive
    'rs2-d01': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 01', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d02': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 02', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d03': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 03', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d04': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 04', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d05': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 05', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d06': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 06', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d07': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 07', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d08': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 08', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d09': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 09', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d10': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 10', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d11': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 11', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d12': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 12', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d13': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 13', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d14': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 14', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d15': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 15', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d16': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 16', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d17': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 17', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d18': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 18', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d19': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 19', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d20': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 20', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d21': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 21', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d22': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 22', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d23': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 23', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d24': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 24', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d25': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 25', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25'] },
    'rs2-d26': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 26', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25','rs2-d26','rs2-d27','rs2-d28','rs2-d29','rs2-d30'] },
    'rs2-d27': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 27', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25','rs2-d26','rs2-d27','rs2-d28','rs2-d29','rs2-d30'] },
    'rs2-d28': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 28', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25','rs2-d26','rs2-d27','rs2-d28','rs2-d29','rs2-d30'] },
    'rs2-d29': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 29', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25','rs2-d26','rs2-d27','rs2-d28','rs2-d29','rs2-d30'] },
    'rs2-d30': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Deep Dive 30', duration: '~2h', level: 'Advanced', siblings: ['rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10','rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20','rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25','rs2-d26','rs2-d27','rs2-d28','rs2-d29','rs2-d30'] },

    // Recommender System — Labs
    'rs2-l01': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 01: Interaction Matrix', duration: '~1h', level: 'Intermediate', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },
    'rs2-l02': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 02: Popularity + CBF', duration: '~1h', level: 'Intermediate', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },
    'rs2-l03': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 03: Item kNN Shrinkage', duration: '~1h', level: 'Advanced', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },
    'rs2-l04': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 04: BPR MF', duration: '~1h', level: 'Advanced', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },
    'rs2-l05': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 05: FAISS Serving', duration: '~1h', level: 'Advanced', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },
    'rs2-l06': { courseId: 'recommender-system', courseLabel: 'Recommender System', title: 'Lab 06: Capstone Pipeline', duration: '~1h', level: 'Advanced', siblings: ['rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06'] },


};

const MODULE_LABELS = {
    'as-m0': 'M0 · What Makes Search Agentic?',
    'as-m1': 'M1 · Search Tool Design',
    'as-m2': 'M2 · Multi-Step Retrieval Planning',
    'as-m3': 'M3 · Web Search Integration',
    'as-m4': 'M4 · Structured & Code Search',
    'as-m5': 'M5 · Search Evaluation & Reliability',
    'as-m6': 'M6 · Production Agentic Search Systems',
    'ce-m0': 'M0 · Context Window as Resource',
    'ce-m1': 'M1 · Information Architecture',
    'ce-m2': 'M2 · Dynamic Context Assembly',
    'ce-m3': 'M3 · System Prompt Engineering',
    'ce-m4': 'M4 · Few-Shot & In-Context Learning',
    'ce-m5': 'M5 · Memory Systems',
    'ce-m6': 'M6 · Multimodal Context',
    'ce-m7': 'M7 · Context for Agents & Tools',
    'ce-m8': 'M8 · Evaluation & Optimization',
    'rs2-m01': 'M01 · You Already Use Recsys',
    'rs2-m02': 'M02 · Four Eras',
    'rs2-m03': 'M03 · Data Lies',
    'rs2-m04': 'M04 · Six Problems',
    'rs2-m05': 'M05 · Answer These',
    'rs2-m06': 'M06 · First Recommender',
    'rs2-m07': 'M07 · Content Based',
    'rs2-m08': 'M08 · Collaborative Filtering',
    'rs2-m09': 'M09 · Item kNN',
    'rs2-m10': 'M10 · Similarity Metrics',
    'rs2-m11': 'M11 · kNN Bug',
    'rs2-m12': 'M12 · User kNN',
    'rs2-m13': 'M13 · Hybrid',
    'rs2-m14': 'M14 · MF Decomposition',
    'rs2-m15': 'M15 · FunkSVD',
    'rs2-m16': 'M16 · BPR',
    'rs2-m17': 'M17 · WRMF',
    'rs2-m18': 'M18 · MF Variants',
    'rs2-m19': 'M19 · Features FM',
    'rs2-m20': 'M20 · Wide & Deep',
    'rs2-m21': 'M21 · Ranking Layer',
    'rs2-m22': 'M22 · SASRec',
    'rs2-m23': 'M23 · LightGCN',
    'rs2-m24': 'M24 · LLM Recsys',
    'rs2-m25': 'M25 · NCF',
    'rs2-m26': 'M26 · Model Zoo',
    'rs2-m27': 'M27 · Full Stack',
    'rs2-m28': 'M28 · Serving',
    'rs2-m29': 'M29 · A/B Testing',
    'rs2-m30': 'M30 · Feedback Loops',
    'rs2-m31': 'M31 · MLOps',
    'rs2-m32': 'M32 · Capstone: Retrieval',
    'rs2-m33': 'M33 · Capstone: Ranking',
    'rs2-m34': 'M34 · Capstone: Finale',
    'rs2-d01': 'D01 · Deep Dive 01',
    'rs2-d02': 'D02 · Deep Dive 02',
    'rs2-d03': 'D03 · Deep Dive 03',
    'rs2-d04': 'D04 · Deep Dive 04',
    'rs2-d05': 'D05 · Deep Dive 05',
    'rs2-d06': 'D06 · Deep Dive 06',
    'rs2-d07': 'D07 · Deep Dive 07',
    'rs2-d08': 'D08 · Deep Dive 08',
    'rs2-d09': 'D09 · Deep Dive 09',
    'rs2-d10': 'D10 · Deep Dive 10',
    'rs2-d11': 'D11 · Deep Dive 11',
    'rs2-d12': 'D12 · Deep Dive 12',
    'rs2-d13': 'D13 · Deep Dive 13',
    'rs2-d14': 'D14 · Deep Dive 14',
    'rs2-d15': 'D15 · Deep Dive 15',
    'rs2-d16': 'D16 · Deep Dive 16',
    'rs2-d17': 'D17 · Deep Dive 17',
    'rs2-d18': 'D18 · Deep Dive 18',
    'rs2-d19': 'D19 · Deep Dive 19',
    'rs2-d20': 'D20 · Deep Dive 20',
    'rs2-d21': 'D21 · Deep Dive 21',
    'rs2-d22': 'D22 · Deep Dive 22',
    'rs2-d23': 'D23 · Deep Dive 23',
    'rs2-d24': 'D24 · Deep Dive 24',
    'rs2-d25': 'D25 · Deep Dive 25',
    'rs2-l01': 'L01 · Lab: Interaction Matrix',
    'rs2-l02': 'L02 · Lab: Popularity + CBF',
    'rs2-l03': 'L03 · Lab: Item kNN Shrinkage',
    'rs2-l04': 'L04 · Lab: BPR MF',
    'rs2-l05': 'L05 · Lab: FAISS Serving',
    'rs2-l06': 'L06 · Lab: Capstone Pipeline',
};

const LEVEL_COLORS = {
    'Beginner':     { bg: 'rgba(65,189,120,0.12)',  color: '#41bd78' },
    'Intermediate': { bg: 'rgba(224,160,80,0.12)',  color: '#e0a050' },
    'Advanced':     { bg: 'rgba(145,128,232,0.12)',  color: '#9180e8' },
};

const FULL_DOCUMENT_MODULES = new Set([
    'as-m0', 'as-m1', 'as-m2', 'as-m3', 'as-m4', 'as-m5', 'as-m6',
    'ce-m0', 'ce-m1', 'ce-m2', 'ce-m3', 'ce-m4', 'ce-m5', 'ce-m6', 'ce-m7', 'ce-m8',
    'rs2-m01','rs2-m02','rs2-m03','rs2-m04','rs2-m05','rs2-m06','rs2-m07','rs2-m08','rs2-m09','rs2-m10',
    'rs2-m11','rs2-m12','rs2-m13','rs2-m14','rs2-m15','rs2-m16','rs2-m17','rs2-m18','rs2-m19','rs2-m20',
    'rs2-m21','rs2-m22','rs2-m23','rs2-m24','rs2-m25','rs2-m26','rs2-m27','rs2-m28','rs2-m29','rs2-m30',
    'rs2-m31','rs2-m32','rs2-m33','rs2-m34',
    'rs2-d01','rs2-d02','rs2-d03','rs2-d04','rs2-d05','rs2-d06','rs2-d07','rs2-d08','rs2-d09','rs2-d10',
    'rs2-d11','rs2-d12','rs2-d13','rs2-d14','rs2-d15','rs2-d16','rs2-d17','rs2-d18','rs2-d19','rs2-d20',
    'rs2-d21','rs2-d22','rs2-d23','rs2-d24','rs2-d25',
    'rs2-l01','rs2-l02','rs2-l03','rs2-l04','rs2-l05','rs2-l06',
]);

//  ZOOMABLE IMAGE

const ZoomableImage = ({ src, alt }) => {
    const [zoomed, setZoomed] = useState(false);
    useEffect(() => {
        if (!zoomed) return;
        const h = (e) => { if (e.key === 'Escape') setZoomed(false); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [zoomed]);

    return (
        <>
            <img src={src} alt={alt} className="cursor-zoom-in rounded-lg" onClick={() => setZoomed(true)} style={{ maxWidth: '100%' }} />
            {zoomed && ReactDOM.createPortal(
                <div onClick={() => setZoomed(false)} style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)', zIndex: 2147483647, cursor: 'zoom-out', padding: 24 }}>
                    <img src={src} alt={alt} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} />
                    <div style={{ position: 'absolute', top: 24, right: 32, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Press Esc to close</div>
                </div>,
                document.body
            )}
        </>
    );
};

//  HTML CONTENT RENDERER

const ProseContent = memo(({ html }) => {
    const options = {
        replace: (node) => {
            if (node.name === 'img') {
                return <ZoomableImage src={node.attribs?.src} alt={node.attribs?.alt || ''} />;
            }
        },
    };
    return (
        <div className="prose-content prose-card selectable-text">
            {parse(html, options)}
        </div>
    );
});
ProseContent.displayName = 'ProseContent';

//  MAIN COMPONENT

export default function ResearchCourseContent() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isDark } = useTheme();
    const iframeRef = useRef(null);
    const inlineIframeRef = useRef(null);

    const injectThemeCSS = useCallback((iframe, dark) => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc || !doc.head) return;
            let tag = doc.getElementById('__marevlo-theme');
            if (!tag) {
                tag = doc.createElement('style');
                tag.id = '__marevlo-theme';
                doc.head.appendChild(tag);
            }
            tag.textContent = dark ? '' : `
                html { filter: invert(1) hue-rotate(180deg) !important; }
                img, video, canvas, picture, .no-invert { filter: invert(1) hue-rotate(180deg) !important; }
            `;
        } catch (_) {}
    }, []);

    useEffect(() => {
        if (iframeRef.current) injectThemeCSS(iframeRef.current, isDark);
        if (inlineIframeRef.current) injectThemeCSS(inlineIframeRef.current, isDark);
    }, [isDark, injectThemeCSS]);

    const config = RESEARCH_COURSE_CONFIGS[id];
    const htmlPath = RESEARCH_HTML_MAP[id];
    const isFullDocumentModule = FULL_DOCUMENT_MODULES.has(id);

    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [completed, setCompleted] = useState({});

    // Fetch HTML
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        setError(null);
        setHtml('');
        if (!htmlPath) {
            setLoading(false);
            return;
        }
        if (isFullDocumentModule) {
            setLoading(false);
            return;
        }
        fetch(htmlPath)
            .then(r => {
                if (!r.ok) throw new Error('Failed to load content');
                return r.text();
            })
            .then(raw => {
                // Extract body content only
                const match = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                setHtml(match ? match[1] : raw);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [htmlPath, isFullDocumentModule]);

    if (!config) {
        return (
            <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                <BookOpen size={48} style={{ opacity: 0.3 }} />
                <p>Module not found.</p>
                <button onClick={() => navigate('/research/courses')} style={{ color: '#98a0ed', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}>← Back to Research Courses</button>
            </div>
        );
    }

    const siblings = config.siblings ?? [];
    const currentIndex = siblings.indexOf(id);
    const prevId = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const nextId = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    const lvl = LEVEL_COLORS[config.level] ?? LEVEL_COLORS['Intermediate'];

    // Full-document modules have their own sidebar/nav — render iframe only
    if (isFullDocumentModule && htmlPath) {
        return (
            <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                <iframe
                    ref={iframeRef}
                    src={htmlPath}
                    title={config.title}
                    onLoad={() => injectThemeCSS(iframeRef.current, isDark)}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: isDark ? '#08090b' : '#ffffff',
                    }}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden text-foreground" style={{ backgroundColor: 'var(--color-app-bg)' }}>

            {/* Sidebar */}
            <aside
                className="bg-card"
                style={{
                    width: sidebarOpen ? 280 : 0,
                    minWidth: sidebarOpen ? 280 : 0,
                    overflow: 'hidden',
                    transition: 'width 0.3s ease, min-width 0.3s ease',
                    borderRight: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                }}
            >
                <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
                    <button
                        onClick={() => navigate('/research/courses')}
                        className="flex items-center gap-2 text-xs font-semibold mb-4 transition-colors duration-200 text-muted-foreground"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#98a0ed'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-muted-text)'}
                    >
                        <ArrowLeft size={14} /> Research Courses
                    </button>
                    <div className="text-muted-foreground" style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                        {config.courseLabel}
                    </div>
                    <div className="text-foreground" style={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3 }}>
                        {config.title}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
                    {siblings.map((sibId) => {
                        const isActive = sibId === id;
                        const isDone = completed[sibId];
                        return (
                            <button
                                key={sibId}
                                onClick={() => navigate(`/research/course/${sibId}`)}
                                style={{
                                    width: '100%', textAlign: 'left',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 12px', borderRadius: 10, marginBottom: 2,
                                    background: isActive ? 'rgba(102,114,224,0.12)' : 'transparent',
                                    border: isActive ? '1px solid rgba(102,114,224,0.3)' : '1px solid transparent',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ flexShrink: 0, color: isDone ? '#41bd78' : isActive ? '#98a0ed' : 'var(--color-muted-text)' }}>
                                    {isDone ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                                </span>
                                <span style={{
                                    fontSize: '0.78rem', fontWeight: isActive ? 600 : 400, lineHeight: 1.35,
                                    color: isActive ? '#98a0ed' : 'var(--color-muted-text)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {MODULE_LABELS[sibId] || sibId}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Progress footer */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
                    <div className="text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 6 }}>
                        <span>Progress</span>
                        <span>{Object.values(completed).filter(Boolean).length} / {siblings.length}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 999,
                            background: 'linear-gradient(90deg,#6672e0,#9180e8)',
                            width: `${(Object.values(completed).filter(Boolean).length / siblings.length) * 100}%`,
                            transition: 'width 0.4s ease',
                        }} />
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Topbar */}
                <div className="bg-card" style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--color-border)',
                    flexShrink: 0,
                }}>
                    <button
                        onClick={() => setSidebarOpen(o => !o)}
                        className="text-muted-foreground"
                        style={{ padding: 6, borderRadius: 8, background: 'var(--color-surface-hover)', border: 'none', cursor: 'pointer', display: 'flex' }}
                        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                    >
                        <Menu size={16} />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-muted-foreground" style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>
                            {config.courseLabel}
                        </div>
                        <div className="text-foreground" style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {config.title}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: lvl.bg, color: lvl.color }}>
                            {config.level}
                        </span>
                        <span className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                            <Clock size={12} /> {config.duration}
                        </span>
                    </div>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px' }}>
                    {loading && (
                        <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
                            <div style={{ width: 36, height: 36, border: '3px solid rgba(102,114,224,0.2)', borderTopColor: '#6672e0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ fontSize: '0.85rem' }}>Loading module…</span>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
                            <BookOpen size={40} style={{ opacity: 0.25 }} />
                            <p style={{ fontSize: '0.9rem' }}>Could not load content: {error}</p>
                        </div>
                    )}

                    {!loading && !error && !htmlPath && (
                        // Coming soon state
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, textAlign: 'center', gap: 16 }}>
                            <div style={{ width: 72, height: 72, borderRadius: '20px', background: 'rgba(102,114,224,0.1)', border: '1px solid rgba(102,114,224,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BookOpen size={32} style={{ color: '#98a0ed', opacity: 0.7 }} />
                            </div>
                            <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Coming Soon</h2>
                            <p className="text-muted-foreground" style={{ maxWidth: 360, lineHeight: 1.7, fontSize: '0.9rem' }}>
                                This module is being prepared. Check back soon.
                            </p>
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            <div style={{ marginBottom: '30px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '14px' }}>
                                    <div>
                                        <div className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                                            Course Modules
                                        </div>
                                        <div className="text-foreground" style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                                            {config.courseLabel}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999, background: lvl.bg, color: lvl.color }}>
                                            {config.level}
                                        </span>
                                        <span className="text-muted-foreground" style={{ fontSize: '0.8rem' }}>
                                            {config.duration}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                                    {siblings.map((sibId, index) => {
                                        const isActive = sibId === id;
                                        const cardLabel = MODULE_LABELS[sibId] || sibId;
                                        const cardConfig = RESEARCH_COURSE_CONFIGS[sibId] || {};
                                        const cardLvl = LEVEL_COLORS[cardConfig.level] || LEVEL_COLORS.Intermediate;

                                        return (
                                            <div
                                                key={sibId}
                                                onClick={() => navigate(`/research/course/${sibId}`)}
                                                style={{
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'space-between',
                                                    minHeight: 150,
                                                    padding: '20px',
                                                    borderRadius: 22,
                                                    background: isActive ? 'rgba(102,114,224,0.16)' : 'var(--color-surface-hover)',
                                                    border: isActive ? '1px solid rgba(102,114,224,0.35)' : '1px solid var(--color-border)',
                                                    boxShadow: isActive ? '0 14px 28px rgba(0,0,0,0.12)' : '0 10px 22px rgba(0,0,0,0.08)',
                                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                                        e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.12)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.transform = 'none';
                                                        e.currentTarget.style.boxShadow = '0 10px 22px rgba(0,0,0,0.08)';
                                                    }
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 38,
                                                            height: 38,
                                                            display: 'grid',
                                                            placeItems: 'center',
                                                            borderRadius: 14,
                                                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                                        }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--foreground)' }}>
                                                                {String(index).padStart(2, '0')}
                                                            </span>
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.25, marginBottom: 6 }}>
                                                                {cardLabel}
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--color-muted-text)' }}>
                                                                    {cardConfig.duration || config.duration}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: cardLvl.bg, color: cardLvl.color, border: `1px solid ${cardLvl.color}33` }}>
                                                        {cardConfig.level || config.level}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <ArrowUpRight size={18} color={isActive ? '#98a0ed' : '#98a0ed'} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {isFullDocumentModule && htmlPath && (
                                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                                    <iframe
                                        ref={inlineIframeRef}
                                        src={htmlPath}
                                        title={config.title}
                                        onLoad={() => injectThemeCSS(inlineIframeRef.current, isDark)}
                                        style={{
                                            width: '100%',
                                            minHeight: '80vh',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 20,
                                            background: isDark ? '#08090b' : '#ffffff',
                                        }}
                                    />
                                </div>
                            )}

                            {!isFullDocumentModule && html && (
                                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                                    <ProseContent html={html} />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Bottom nav */}
                <div className="bg-card" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderTop: '1px solid var(--color-border)',
                    flexShrink: 0,
                }}>
                    <button
                        onClick={() => prevId && navigate(`/research/course/${prevId}`)}
                        disabled={!prevId}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
                            background: prevId ? 'var(--color-surface-hover)' : 'transparent',
                            border: '1px solid var(--color-border)',
                            color: prevId ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                            cursor: prevId ? 'pointer' : 'default',
                            opacity: prevId ? 1 : 0.4,
                            transition: 'all 0.2s',
                        }}
                    >
                        <ChevronLeft size={15} /> Previous
                    </button>

                    <button
                        onClick={() => {
                            setCompleted(c => ({ ...c, [id]: true }));
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
                            background: completed[id] ? 'rgba(65,189,120,0.12)' : 'rgba(102,114,224,0.1)',
                            border: completed[id] ? '1px solid rgba(65,189,120,0.3)' : '1px solid rgba(102,114,224,0.3)',
                            color: completed[id] ? '#41bd78' : '#98a0ed',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <CheckCircle2 size={15} />
                        {completed[id] ? 'Completed' : 'Mark Complete'}
                    </button>

                    <button
                        onClick={() => nextId ? navigate(`/research/course/${nextId}`) : navigate('/research/courses')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
                            background: 'linear-gradient(135deg,#6672e0,#9180e8)',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(102,114,224,0.3)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {nextId ? 'Next' : 'Finish'} <ChevronRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
