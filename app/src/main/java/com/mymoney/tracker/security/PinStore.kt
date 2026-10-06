package com.mymoney.tracker.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * The PIN is NEVER stored. Only a salted PBKDF2 hash is kept, inside EncryptedSharedPreferences
 * (AES-256, master key in the Android Keystore).
 */
class PinStore(private val ctx: Context) {
    enum class Result { OK, WRONG, LOCKED }

    private val prefs: SharedPreferences by lazy {
        val key = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(ctx, "lock_store", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }

    fun hasPin(): Boolean = try { prefs.contains("hash") } catch (e: Exception) { false }

    fun setPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit().putString("salt", b64(salt)).putString("hash", b64(hash(pin, salt)))
            .putInt("fails", 0).putLong("lockUntil", 0L).apply()
    }

    fun verify(pin: String): Result {
        if (lockedSeconds() > 0) return Result.LOCKED
        val salt = prefs.getString("salt", null)?.let(::unb64) ?: return Result.WRONG
        val expected = prefs.getString("hash", null)?.let(::unb64) ?: return Result.WRONG
        return if (MessageDigest.isEqual(expected, hash(pin, salt))) {
            prefs.edit().putInt("fails", 0).apply(); Result.OK
        } else {
            val fails = prefs.getInt("fails", 0) + 1
            val e = prefs.edit().putInt("fails", fails)
            if (fails % 5 == 0) e.putLong("lockUntil", System.currentTimeMillis() + 30_000L * (fails / 5))
            e.apply(); Result.WRONG
        }
    }

    fun lockedSeconds(): Int {
        val left = prefs.getLong("lockUntil", 0L) - System.currentTimeMillis()
        return if (left > 0) ((left + 999) / 1000).toInt() else 0
    }

    var biometricEnabled: Boolean
        get() = try { prefs.getBoolean("bio", true) } catch (e: Exception) { false }
        set(v) { prefs.edit().putBoolean("bio", v).apply() }

    fun clear() { try { prefs.edit().clear().apply() } catch (_: Exception) {} }

    private fun hash(pin: String, salt: ByteArray): ByteArray =
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(PBEKeySpec(pin.toCharArray(), salt, 120_000, 256)).encoded
    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun unb64(s: String) = Base64.decode(s, Base64.NO_WRAP)
}
