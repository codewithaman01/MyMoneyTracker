package com.mymoney.tracker.extras

import android.content.Context
import android.content.SharedPreferences
import com.mymoney.tracker.notify.Notifier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

data class TodoItem(val id: Long, val title: String, val due: String = "", val done: Boolean = false, val remind: Boolean = true)
data class Bill(val id: Long, val name: String, val amount: Long = 0L, val dueDay: Int = 1, val remindDays: Int = 2, val paidMonth: String = "")
data class ShopItem(val id: Long, val name: String, val done: Boolean = false)

/** Small local store (private SharedPreferences, JSON) for the to-do list, bills and shopping list. Nothing leaves the phone. */
object ExtrasStore {
    private var prefs: SharedPreferences? = null
    private val _todos = MutableStateFlow<List<TodoItem>>(emptyList())
    private val _bills = MutableStateFlow<List<Bill>>(emptyList())
    private val _shop = MutableStateFlow<List<ShopItem>>(emptyList())
    val todos: StateFlow<List<TodoItem>> = _todos
    val bills: StateFlow<List<Bill>> = _bills
    val shop: StateFlow<List<ShopItem>> = _shop

    @Synchronized
    fun init(ctx: Context) {
        if (prefs != null) return
        val p = ctx.applicationContext.getSharedPreferences("extras", Context.MODE_PRIVATE)
        prefs = p
        load(p.getString("data", "") ?: "")
    }

    fun newId(): Long = System.nanoTime()

    private fun <T> JSONArray?.mapObjs(f: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return (0 until length()).map { f(getJSONObject(it)) }
    }

    private fun load(text: String) {
        if (text.isBlank()) return
        try {
            val o = JSONObject(text)
            _todos.value = o.optJSONArray("todos").mapObjs {
                TodoItem(it.getLong("id"), it.getString("title"), it.optString("due", ""), it.optBoolean("done", false), it.optBoolean("remind", true)) }
            _bills.value = o.optJSONArray("bills").mapObjs {
                Bill(it.getLong("id"), it.getString("name"), it.optLong("amount", 0L), it.optInt("dueDay", 1), it.optInt("remindDays", 2), it.optString("paidMonth", "")) }
            _shop.value = o.optJSONArray("shop").mapObjs {
                ShopItem(it.getLong("id"), it.getString("name"), it.optBoolean("done", false)) }
        } catch (e: Exception) { /* keep what we have */ }
    }

    fun exportJson(): String {
        val o = JSONObject()
        val t = JSONArray()
        _todos.value.forEach { t.put(JSONObject().put("id", it.id).put("title", it.title).put("due", it.due).put("done", it.done).put("remind", it.remind)) }
        val b = JSONArray()
        _bills.value.forEach { b.put(JSONObject().put("id", it.id).put("name", it.name).put("amount", it.amount).put("dueDay", it.dueDay).put("remindDays", it.remindDays).put("paidMonth", it.paidMonth)) }
        val s = JSONArray()
        _shop.value.forEach { s.put(JSONObject().put("id", it.id).put("name", it.name).put("done", it.done)) }
        o.put("todos", t); o.put("bills", b); o.put("shop", s)
        return o.toString()
    }

    fun importJson(text: String) { if (text.isBlank()) return; load(text); persist() }
    private fun persist() { prefs?.edit()?.putString("data", exportJson())?.apply() }

    // ---- to-do
    fun addTodo(title: String, due: String, remind: Boolean) { _todos.value = _todos.value + TodoItem(newId(), title.trim(), due, false, remind); persist() }
    fun updateTodo(t: TodoItem) { _todos.value = _todos.value.map { if (it.id == t.id) t else it }; persist() }
    fun deleteTodo(id: Long) { _todos.value = _todos.value.filter { it.id != id }; persist() }

    // ---- bills
    fun saveBill(b: Bill) {
        _bills.value = if (_bills.value.any { it.id == b.id }) _bills.value.map { if (it.id == b.id) b else it } else _bills.value + b
        persist()
    }
    fun deleteBill(id: Long) { _bills.value = _bills.value.filter { it.id != id }; persist() }
    fun setBillPaid(id: Long, paid: Boolean, month: String) {
        _bills.value = _bills.value.map { if (it.id == id) it.copy(paidMonth = if (paid) month else "") else it }; persist()
    }

    /** The date this bill should be paid next: this month's due day, or next month's once this month is paid. */
    fun nextDue(b: Bill, today: LocalDate): LocalDate {
        val ym = YearMonth.from(today)
        fun inMonth(m: YearMonth): LocalDate = m.atDay(minOf(b.dueDay, m.lengthOfMonth()))
        return if (b.paidMonth == ym.toString()) inMonth(ym.plusMonths(1)) else inMonth(ym)
    }

    // ---- shopping
    fun addShop(name: String) { _shop.value = _shop.value + ShopItem(newId(), name.trim()); persist() }
    fun toggleShop(id: Long) { _shop.value = _shop.value.map { if (it.id == id) it.copy(done = !it.done) else it }; persist() }
    fun deleteShop(id: Long) { _shop.value = _shop.value.filter { it.id != id }; persist() }
    fun clearBought() { _shop.value = _shop.value.filter { !it.done }; persist() }

    /** Called once a day by the reminder worker. Amounts are never put in notifications. */
    fun notifyDue(ctx: Context, today: LocalDate) {
        init(ctx)
        val dueTasks = _todos.value.filter { t ->
            val d = runCatching { LocalDate.parse(t.due) }.getOrNull()
            !t.done && t.remind && d != null && !d.isAfter(today)
        }
        if (dueTasks.isNotEmpty())
            Notifier.show(ctx, 7000, "Tasks due", if (dueTasks.size == 1) dueTasks[0].title else "${dueTasks.size} tasks are due or overdue")
        var n = 0
        for (b in _bills.value) {
            val days = ChronoUnit.DAYS.between(today, nextDue(b, today)).toInt()
            if (days <= b.remindDays) {
                val text = when {
                    days < 0 -> "Overdue by ${-days} days"
                    days == 0 -> "Due today"
                    days == 1 -> "Due tomorrow"
                    else -> "Due in $days days"
                }
                Notifier.show(ctx, 7100 + n, b.name, text)
                n++
            }
        }
    }
}
