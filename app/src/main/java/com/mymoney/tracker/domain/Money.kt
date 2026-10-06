package com.mymoney.tracker.domain

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs

/** All money is Long paise. This file is the ONLY place that converts to/from text. */
object Money {
    /** 2980000 -> "₹29,800" ; 12345678 -> "₹1,23,456.78" (Indian digit grouping) */
    fun format(paise: Long, symbol: String = "₹"): String {
        val neg = paise < 0
        val a = abs(paise)
        val rupees = (a / 100).toString()
        val cents = (a % 100).toInt()
        val grouped = if (rupees.length <= 3) rupees else {
            val last3 = rupees.takeLast(3)
            val rest = rupees.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
            "$rest,$last3"
        }
        val frac = if (cents == 0) "" else ".%02d".format(cents)
        return (if (neg) "-" else "") + symbol + grouped + frac
    }

    /** Parses user input like "29,800" or "2500.50". Returns null when invalid or negative. */
    fun parse(text: String): Long? {
        val d = text.trim().replace(",", "").toBigDecimalOrNull() ?: return null
        if (d < BigDecimal.ZERO) return null
        return d.multiply(BigDecimal(100)).setScale(0, RoundingMode.HALF_UP).toLong()
    }
}
