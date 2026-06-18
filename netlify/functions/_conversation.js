const LIMITS = {
    messages: 12,
    content: 4000,
    total: 12000
};

function validateConversationHistory(value) {
    if (value === undefined || value === null) {
        return { errors: [], history: [] };
    }
    if (!Array.isArray(value)) {
        return { errors: ['conversationHistory must be an array'], history: [] };
    }

    const errors = [];
    const history = [];
    let total = 0;

    value.slice(-LIMITS.messages).forEach(item => {
        const role = item && String(item.role || '');
        const content = item && String(item.content || '').trim();
        if (role !== 'user' && role !== 'assistant') {
            errors.push('conversationHistory roles must be user or assistant');
            return;
        }
        if (!content || content.length > LIMITS.content) {
            errors.push(`conversationHistory content must be 1-${LIMITS.content} characters`);
            return;
        }
        if (total + content.length > LIMITS.total) return;
        total += content.length;
        history.push({ role, content });
    });

    return { errors: [...new Set(errors)], history };
}

module.exports = {
    validateConversationHistory
};
