const DEFAULT_QUESTION_SET = [
    {
        id: "cat-centering",
        name: "Centering",
        description: "Start with the things that shape the rest of the week.",
        questions: [
            {
                id: "q-centering-study",
                title: "What will you study or reflect on this week?",
                description: "Pick something that keeps your attention steady.",
                default: "The Book of Mormon"
            },
            {
                id: "q-centering-focus",
                title: "What one attribute or habit do you want to strengthen?",
                description: "Include a sentence about how you will practice it.",
                default: ""
            }
        ]
    },
    {
        id: "cat-body",
        name: "Body",
        description: "Keep the plan grounded in energy, rest, and movement.",
        questions: [
            {
                id: "q-body-care",
                title: "How will you take care of your body this week?",
                description: "Think movement, sleep, hydration, or recovery.",
                default: "Go on a hike on Saturday"
            }
        ]
    },
    {
        id: "cat-priorities",
        name: "Priorities",
        description: "Pick the work that will make the week feel complete.",
        questions: [
            {
                id: "q-priorities-top3",
                title: "What are the three most important things this week?",
                description: "Short, specific, and easy to scan later.",
                default: ""
            },
            {
                id: "q-priorities-risk",
                title: "What could get in the way, and how will you respond?",
                description: "Name the friction before the week gets busy.",
                default: ""
            }
        ]
    }
];

const STORAGE_KEYS = {
    questionSet: "weekly-planner-question-set",
    savedPlan: "weekly-planner-saved-plan",
    draftAnswers: "weekly-planner-draft-answers",
    currentCategoryIndex: "weekly-planner-current-category-index"
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeQuestion(question = {}) {
    return {
        id: question.id || createId("question"),
        title: question.title || "New question",
        description: question.description || "",
        default: question.default || ""
    };
}

function normalizeCategory(category = {}) {
    const questions = Array.isArray(category.questions) && category.questions.length > 0
        ? category.questions.map((question) => normalizeQuestion(question))
        : [normalizeQuestion()];

    return {
        id: category.id || createId("category"),
        name: category.name || "New category",
        description: category.description || "",
        questions
    };
}

function normalizeQuestionSet(source) {
    const categories = Array.isArray(source) ? source.map((category) => normalizeCategory(category)) : [];
    return categories.length > 0 ? categories : clone(DEFAULT_QUESTION_SET);
}

function buildDraftAnswers(questionSet) {
    const answers = {};

    questionSet.forEach((category) => {
        category.questions.forEach((question) => {
            answers[question.id] = question.default || "";
        });
    });

    return answers;
}

function syncDraftAnswers(currentAnswers, questionSet) {
    const nextAnswers = {};

    questionSet.forEach((category) => {
        category.questions.forEach((question) => {
            nextAnswers[question.id] = currentAnswers?.[question.id] ?? question.default ?? "";
        });
    });

    return nextAnswers;
}

function clampCategoryIndex(index, totalCategories) {
    if (totalCategories <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(index, totalCategories - 1));
}

function buildSavedSnapshot(questionSet, draftAnswers) {
    return {
        createdAt: new Date().toISOString(),
        categories: questionSet.map((category) => ({
            id: category.id,
            name: category.name,
            description: category.description || "",
            questions: category.questions.map((question) => ({
                id: question.id,
                title: question.title,
                description: question.description || "",
                default: question.default || "",
                answer: draftAnswers[question.id] ?? ""
            }))
        }))
    };
}

function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(timestamp));
}

document.addEventListener("alpine:init", () => {
    Alpine.data("plannerApp", () => ({
        questionSet: Alpine.$persist(clone(DEFAULT_QUESTION_SET)).as(STORAGE_KEYS.questionSet),
        savedPlan: Alpine.$persist(null).as(STORAGE_KEYS.savedPlan),
        draftAnswers: Alpine.$persist(buildDraftAnswers(DEFAULT_QUESTION_SET)).as(STORAGE_KEYS.draftAnswers),
        currentCategoryIndex: Alpine.$persist(0).as(STORAGE_KEYS.currentCategoryIndex),

        screen: "walkthrough",
        isImporting: false,
        statusMessage: "",

        init() {
            this.questionSet = normalizeQuestionSet(this.questionSet);
            this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
            this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
            this.screen = this.savedPlan ? "saved" : "walkthrough";
        },

        get hasSavedPlan() {
            return Boolean(this.savedPlan);
        },

        get currentCategory() {
            return this.questionSet[this.currentCategoryIndex] || null;
        },

        get isLastCategory() {
            return this.currentCategoryIndex >= this.questionSet.length - 1;
        },

        get progressPercent() {
            if (this.questionSet.length === 0) {
                return 0;
            }

            return ((this.currentCategoryIndex + 1) / this.questionSet.length) * 100;
        },

        get formattedSavedAt() {
            return this.savedPlan ? formatDateTime(this.savedPlan.createdAt) : "";
        },

        triggerImportPicker() {
            this.$refs.importFileInput?.click();
        },

        exportQuestionSet() {
            const payload = JSON.stringify({ questionSet: this.questionSet }, null, 2);
            const blob = new Blob([payload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");

            anchor.href = url;
            anchor.download = "weekly-planner-questions.json";
            anchor.click();

            setTimeout(() => URL.revokeObjectURL(url), 0);
            this.statusMessage = "Question file exported.";
        },

        async importQuestionFile(event) {
            const file = event?.target?.files?.[0];

            if (!file) {
                return;
            }

            this.isImporting = true;

            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const importedSet = normalizeQuestionSet(parsed.questionSet || parsed.categories || parsed);

                this.questionSet = importedSet;
                this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
                this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
                this.statusMessage = `Imported ${file.name}.`;
            } catch (error) {
                this.statusMessage = "That file could not be imported.";
            } finally {
                this.isImporting = false;
                event.target.value = "";
            }
        },

        openEditor() {
            this.statusMessage = "";
            this.screen = "editor";
        },

        setScreen(screen) {
            this.statusMessage = "";
            this.screen = screen;
        },

        backFromEditor() {
            this.statusMessage = "";
            this.screen = this.hasSavedPlan ? "saved" : "walkthrough";
        },

        startWalkthrough() {
            this.statusMessage = "";
            this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
            this.screen = "walkthrough";
        },

        resetDraftToDefaults() {
            this.draftAnswers = buildDraftAnswers(this.questionSet);
            this.currentCategoryIndex = 0;
        },

        clearSavedPlan() {
            this.savedPlan = null;
            this.resetDraftToDefaults();
            this.screen = "walkthrough";
            this.statusMessage = "Saved plan cleared.";
        },

        nextCategory() {
            if (this.isLastCategory) {
                this.savePlan();
                return;
            }

            this.currentCategoryIndex += 1;
        },

        savePlan() {
            this.savedPlan = buildSavedSnapshot(this.questionSet, this.draftAnswers);
            this.screen = "saved";
            this.statusMessage = "Weekly plan saved.";
            this.currentCategoryIndex = 0;
        },

        addCategory() {
            this.questionSet.push(normalizeCategory());
            this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
            this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
            this.statusMessage = "Category added.";
        },

        removeCategory(categoryIndex) {
            if (this.questionSet.length <= 1) {
                this.statusMessage = "Keep at least one category.";
                return;
            }

            const [removedCategory] = this.questionSet.splice(categoryIndex, 1);
            if (removedCategory) {
                this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
                this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
                this.statusMessage = "Category removed.";
            }
        },

        addQuestion(categoryIndex) {
            const category = this.questionSet[categoryIndex];
            if (!category) {
                return;
            }

            const question = normalizeQuestion();
            category.questions.push(question);
            this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
            this.statusMessage = "Question added.";
        },

        removeQuestion(categoryIndex, questionIndex) {
            const category = this.questionSet[categoryIndex];
            if (!category || category.questions.length <= 1) {
                this.statusMessage = "Keep at least one question in each category.";
                return;
            }

            const [removedQuestion] = category.questions.splice(questionIndex, 1);
            if (removedQuestion) {
                this.draftAnswers = syncDraftAnswers(this.draftAnswers, this.questionSet);
                this.statusMessage = "Question removed.";
                this.currentCategoryIndex = clampCategoryIndex(this.currentCategoryIndex, this.questionSet.length);
            }
        },

        clearQuestionField(question, field) {
            if (question && Object.prototype.hasOwnProperty.call(question, field)) {
                question[field] = "";
                this.statusMessage = `${field} cleared.`;
            }
        },

        resetQuestionSet() {
            this.questionSet = clone(DEFAULT_QUESTION_SET);
            this.draftAnswers = buildDraftAnswers(this.questionSet);
            this.currentCategoryIndex = 0;
            this.statusMessage = "Default questions restored.";
        },
    }));
});
