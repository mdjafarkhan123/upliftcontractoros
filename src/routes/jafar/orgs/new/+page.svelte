<script lang="ts">

	let { data } = $props<{ data: { errorMessage: string | null } }>();
</script>

<svelte:head>
	<title>New Organization</title>
</svelte:head>

<main>
	<h1>Create Organization</h1>
	<p><a href="/jafar/dashboard">Back to dashboard</a></p>

	{#if data.errorMessage}
		<p role="alert">{data.errorMessage}</p>
	{/if}

	<form method="POST">
		<label for="businessName">Business name</label>
		<input id="businessName" name="businessName" required />

		<label for="slug">Slug</label>
		<input id="slug" name="slug" required />

		<label for="tradeType">Trade type</label>
		<input id="tradeType" name="tradeType" required />

		<label for="city">City</label>
		<input id="city" name="city" required />

		<label for="state">State</label>
		<input id="state" name="state" required />

		<label for="timezone">Timezone</label>
		<input id="timezone" name="timezone" value="America/Chicago" required />

		<label for="twilioPhoneNumber">Twilio phone number</label>
		<input id="twilioPhoneNumber" name="twilioPhoneNumber" required />

		<label for="adminFullName">Admin full name</label>
		<input id="adminFullName" name="adminFullName" required />

		<label for="adminEmail">Admin email</label>
		<input id="adminEmail" name="adminEmail" type="email" required />

		<label for="adminTemporaryPassword">Admin temporary password</label>
		<input id="adminTemporaryPassword" name="adminTemporaryPassword" type="password" required />

		<button type="submit">Create</button>
	</form>
</main>
