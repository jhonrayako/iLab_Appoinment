const { query } = require('../config/db');
const { classifySentiment } = require('./sentimentEngine');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Submit feedback with sentiment classification
 */
const submitFeedback = async ({ userId, rawMessage }) => {
  if (!userId || !rawMessage) {
    throw new HttpError(400, 'Missing userId or message');
  }

  if (rawMessage.trim().length === 0) {
    throw new HttpError(400, 'Feedback message cannot be empty');
  }

  try {
    // Classify sentiment
    const { label, score } = await classifySentiment(rawMessage);

    // Insert feedback with sentiment label
    const result = await query(
      `INSERT INTO feedback (user_id, raw_message, sentiment_label, sentiment_score)
       VALUES ($1, $2, $3, $4)
       RETURNING feedback_id, user_id, raw_message, sentiment_label, sentiment_score, submitted_at`,
      [userId, rawMessage, label, score]
    );

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error submitting feedback: ' + error.message);
  }
};

/**
 * Get sentiment summary (totals per label)
 */
const getSentimentSummary = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let query_text = `
      SELECT sentiment_label, COUNT(*) as count
      FROM feedback
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND submitted_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND submitted_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += ` GROUP BY sentiment_label ORDER BY count DESC`;

    const result = await query(query_text, params);

    // Format as object
    const summary = {
      Positive: 0,
      Neutral: 0,
      Negative: 0,
      total: 0,
    };

    result.rows.forEach(row => {
      summary[row.sentiment_label] = row.count;
      summary.total += row.count;
    });

    return summary;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting sentiment summary: ' + error.message);
  }
};

/**
 * Get sentiment trend over time (grouped by day/week/month)
 */
const getSentimentTrend = async ({
  period = 'day', // 'day', 'week', 'month'
  startDate = null,
  endDate = null,
  limit = 30,
} = {}) => {
  try {
    let dateTrunc;

    switch (period) {
      case 'week':
        dateTrunc = "DATE_TRUNC('week', submitted_at)";
        break;
      case 'month':
        dateTrunc = "DATE_TRUNC('month', submitted_at)";
        break;
      case 'day':
      default:
        dateTrunc = "DATE_TRUNC('day', submitted_at)";
    }

    let query_text = `
      SELECT 
        ${dateTrunc} as period,
        sentiment_label,
        COUNT(*) as count
      FROM feedback
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND submitted_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND submitted_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += `
      GROUP BY period, sentiment_label
      ORDER BY period DESC, sentiment_label
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await query(query_text, params);

    // Format as nested structure
    const trend = [];
    let currentPeriod = null;
    let periodData = null;

    result.rows.forEach(row => {
      if (row.period !== currentPeriod) {
        if (periodData) {
          trend.push(periodData);
        }
        currentPeriod = row.period;
        periodData = {
          period: row.period,
          Positive: 0,
          Neutral: 0,
          Negative: 0,
          total: 0,
        };
      }

      periodData[row.sentiment_label] = row.count;
      periodData.total += row.count;
    });

    if (periodData) {
      trend.push(periodData);
    }

    return trend;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting sentiment trend: ' + error.message);
  }
};

/**
 * List recent feedback with optional filters
 */
const listRecentFeedback = async ({
  sentimentLabel = null,
  limit = 20,
  offset = 0,
  startDate = null,
  endDate = null,
} = {}) => {
  try {
    let query_text = `
      SELECT f.feedback_id, f.user_id, u.first_name, u.last_name, u.email,
             f.raw_message, f.sentiment_label, f.sentiment_score, f.submitted_at
      FROM feedback f
      JOIN users u ON f.user_id = u.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (sentimentLabel) {
      query_text += ` AND f.sentiment_label = $${paramIndex}`;
      params.push(sentimentLabel);
      paramIndex++;
    }

    if (startDate) {
      query_text += ` AND f.submitted_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND f.submitted_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += `
      ORDER BY f.submitted_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await query(query_text, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM feedback WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (sentimentLabel) {
      countQuery += ` AND sentiment_label = $${countParamIndex}`;
      countParams.push(sentimentLabel);
      countParamIndex++;
    }

    if (startDate) {
      countQuery += ` AND submitted_at >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND submitted_at <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }

    const countResult = await query(countQuery, countParams);

    return {
      feedback: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error listing feedback: ' + error.message);
  }
};

module.exports = {
  submitFeedback,
  getSentimentSummary,
  getSentimentTrend,
  listRecentFeedback,
};
